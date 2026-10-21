import type {Dependencies,Row} from './ports';
import {ApiError} from './errors';

type RefundStatus='pending'|'requires_action'|'succeeded'|'failed'|'canceled';
export type RefundFact={id:string;occurred_at:string;amount_minor:number;currency:string;status:RefundStatus};
type RefundOrder={id:string;amount_minor:number;currency:string};
type RefundDependencies=Pick<Dependencies,'db'|'payments'|'now'>;
type GapReason='list_failed'|'invalid_payload'|'incomplete_page'|'incomplete_list'|'persistence_failed';
const MAX_REFUNDS=100; // The record RPC deliberately bounds its atomic JSON batch.
const MAX_PAGES=8;
const identifier=(value:unknown):value is string=>typeof value==='string'&&/^[A-Za-z0-9_-]{1,200}$/.test(value);
const terminal=(status:RefundStatus)=>!['pending','requires_action'].includes(status);

/**
 * Collect actual provider refund objects, independently of browser analytics.
 * Coverage settings declare an observation interval; they must not gate durable
 * payment facts. The optional cumulative value is a reconciliation check only.
 */
export async function recordStripeRefundFacts(
 deps:RefundDependencies,order:RefundOrder,chargeId:string,eventId:string,expectedRefundedMinor?:number,
):Promise<{recorded:number;refunds:number}>{
 let reason:GapReason='invalid_payload';
 try{
  if(!identifier(order.id)||!identifier(eventId)||!identifier(chargeId)||
    !Number.isSafeInteger(order.amount_minor)||order.amount_minor<=0||!/^[A-Z]{3}$/.test(order.currency)||
    (expectedRefundedMinor!==undefined&&(!Number.isSafeInteger(expectedRefundedMinor)||expectedRefundedMinor<0||expectedRefundedMinor>order.amount_minor)))throw new Error('invalid refund context');
  reason='list_failed';
  if(!deps.payments.listRefunds)throw new Error('refund listing unavailable');
  const facts=new Map<string,RefundFact>(),cursors=new Set<string>();
  let cursor:string|undefined,complete=false;
  for(let pageNumber=0;pageNumber<MAX_PAGES;pageNumber++){
   reason='list_failed';
   const page=await deps.payments.listRefunds(chargeId,cursor);
   reason='invalid_payload';
   if(!page||!Array.isArray(page.data)||page.data.length>100||typeof page.has_more!=='boolean')throw new Error('invalid refund page');
   for(const row of page.data){
    const fact=refundFact(row,chargeId,order,deps.now());
    const existing=facts.get(fact.id);
    if(existing){
     if(existing.occurred_at!==fact.occurred_at||existing.amount_minor!==fact.amount_minor||existing.currency!==fact.currency||
       (existing.status!==fact.status&&terminal(existing.status)&&terminal(fact.status)))throw new Error('conflicting refund replay');
     // A duplicate pending observation must not downgrade a terminal fact.
     if(!terminal(existing.status))facts.set(fact.id,fact);
    }else facts.set(fact.id,fact);
    if(facts.size>MAX_REFUNDS){reason='incomplete_list';throw new Error('refund batch exceeds bound');}
   }
   if(!page.has_more){complete=true;break;}
   reason='incomplete_page';
   const next=page.data.at(-1)?.id;
   if(!identifier(next)||cursors.has(next))throw new Error('refund cursor did not progress');
   cursors.add(next);cursor=next;
   reason='incomplete_list';
   if(facts.size===MAX_REFUNDS)throw new Error('additional refund pages exceed bound');
  }
  reason='incomplete_list';
  if(!complete)throw new Error('refund page bound reached');
  const records=[...facts.values()].sort((a,b)=>a.id.localeCompare(b.id));
  const succeeded=records.filter(r=>r.status==='succeeded').reduce((total,r)=>total+r.amount_minor,0);
  const pending=records.filter(r=>!terminal(r.status)).reduce((total,r)=>total+r.amount_minor,0);
  // A pending refund is a real fact but is not yet a successful outflow. Do not
  // require the Charge's cumulative counter to equal only terminal successes;
  // it is used solely to detect amounts the complete list cannot account for.
  if(!Number.isSafeInteger(succeeded)||succeeded>order.amount_minor||
    !Number.isSafeInteger(pending)||
    (expectedRefundedMinor!==undefined&&(expectedRefundedMinor<succeeded||expectedRefundedMinor>succeeded+pending)))throw new Error('refund list does not reconcile');
  reason='persistence_failed';
  const result=await deps.db.rpc<Row>('app_console_record_refunds',{
   p_order_id:order.id,p_refunds:records,p_event_id:eventId,
  });
  // The RPC commits the complete set atomically and resolves this event's gap.
  // Do not resolve it in a separate client call that could race the write.
  return {recorded:typeof result?.recorded==='number'?result.recorded:records.length,refunds:records.length};
 }catch{
  try{
   await deps.db.rpc('app_console_note_refund_gap',{p_order_id:order.id,p_event_id:eventId,p_reason:reason});
  }catch{
   // An unavailable database cannot persist its own outage. Still return a
   // retryable failure, so the signed webhook is never acknowledged as complete.
  }
  // Provider payloads and error messages can contain payment/customer data.
  // Expose only the existing canonical retryable service error.
  throw new ApiError('SERVICE_UNAVAILABLE',503,true);
 }
}

function refundFact(row:Row,chargeId:string,order:RefundOrder,now:Date):RefundFact{
 if(!row||typeof row!=='object'||Array.isArray(row))throw new Error('invalid refund object');
 const charge=typeof row.charge==='string'?row.charge:row.charge?.id;
 const status=row.status as RefundStatus;
 if(!identifier(row.id)||!row.id.startsWith('re_')||charge!==chargeId||
   !Number.isSafeInteger(row.amount)||row.amount<=0||row.amount>order.amount_minor||
   typeof row.currency!=='string'||!/^[a-z]{3}$/.test(row.currency)||row.currency.toUpperCase()!==order.currency||
   !Number.isSafeInteger(row.created)||row.created<0||row.created*1000>now.getTime()+5*60_000||
   !['pending','requires_action','succeeded','failed','canceled'].includes(status))throw new Error('invalid refund fields');
 const occurred=new Date(row.created*1000);
 if(!Number.isFinite(occurred.getTime()))throw new Error('invalid refund timestamp');
 return {id:row.id,occurred_at:occurred.toISOString(),amount_minor:row.amount,currency:row.currency.toUpperCase(),status};
}
