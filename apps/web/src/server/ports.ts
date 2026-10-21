export type Row=Record<string,any>;
export interface Database{
 authenticate(token:string):Promise<{id:string,email?:string}>;
 rpc<T=Row>(name:string,args:Row):Promise<T>;
 one(table:string,filters:Row):Promise<Row|null>;
 list(table:string,ownerId:string,limit:number,cursor?:string):Promise<Row[]>;
 packages():Promise<Row[]>;
 findJob(ownerId:string,key:string):Promise<Row|null>;
 markCleanup(id:string,pending:boolean):Promise<void>;
}
export interface Storage{
 signPut(key:string,mime:string,bytes:number):Promise<string>;
 read(key:string,maxBytes:number):Promise<{bytes:Buffer,mime:string}>;
 write(key:string,bytes:Buffer,mime:string):Promise<void>;
 remove(keys:string[]):Promise<void>;
 signGet(key:string,attachment?:boolean):Promise<string>;
}
export interface Payments{
 createCheckout(order:Row,origin:string):Promise<{id:string,url:string}>;
 verifyEvent(raw:Buffer,signature:string):Row;
 retrieveSession(id:string):Promise<Row>;
 retrievePaymentIntent(id:string):Promise<Row>;
 retrieveCharge(id:string):Promise<Row>;
 /** A single bounded, read-only Stripe refund page; never an auto-paginating stream. */
 listRefunds?(chargeId:string,startingAfter?:string):Promise<{data:Row[];has_more:boolean}>;
}
export interface Dependencies{db:Database;storage:Storage;payments:Payments;fetch:typeof fetch;now:()=>Date;}
