import Stripe from 'stripe';
import type { Payments,Row } from './ports';
import { required } from './config';
import { ApiError } from './errors';
export class StripePayments implements Payments{
 private cached?:Stripe;
 private get client(){return this.cached??=new Stripe(required('STRIPE_SECRET_KEY'),{maxNetworkRetries:2,timeout:10000});}
 async createCheckout(order:Row,origin:string){
 const session=await this.client.checkout.sessions.create({mode:'payment',client_reference_id:order.id,success_url:`${origin}/ja/billing/success?session_id={CHECKOUT_SESSION_ID}`,cancel_url:`${origin}/ja/pricing`,metadata:{order_id:order.id,user_id:order.owner_id},line_items:[{quantity:1,price_data:{currency:'jpy',unit_amount:order.amount_minor,product_data:{name:`${order.credits} credits`}}}]},{idempotencyKey:`checkout:${order.id}`});
 if(!session.url)throw new ApiError('SERVICE_UNAVAILABLE',503,true);return {id:session.id,url:session.url};
 }
 verifyEvent(raw:Buffer,signature:string){try{return this.client.webhooks.constructEvent(raw,signature,required('STRIPE_WEBHOOK_SECRET')) as unknown as Row;}catch(e){if(e instanceof ApiError)throw e;throw new ApiError('INVALID_SIGNATURE',400);}}
 async retrieveSession(id:string){return await this.client.checkout.sessions.retrieve(id) as unknown as Row;}
 async retrievePaymentIntent(id:string){return await this.client.paymentIntents.retrieve(id,{expand:['latest_charge']}) as unknown as Row;}
 async retrieveCharge(id:string){return await this.client.charges.retrieve(id) as unknown as Row;}
 async listRefunds(chargeId:string,startingAfter?:string){
  // SDK RefundsResource.list is GET /v1/refunds. Charge.refunds only embeds the
  // ten most recent objects, so it is not a complete accounting source.
  const page=await this.client.refunds.list({charge:chargeId,limit:25,...(startingAfter?{starting_after:startingAfter}:{})},
   {timeout:3000,maxNetworkRetries:0});
  return {data:page.data as unknown as Row[],has_more:page.has_more};
 }
}
