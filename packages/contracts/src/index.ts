import { z } from 'zod';

export const CONTRACT_VERSION = '1.0.0' as const;
export const ToolId = z.enum(['remove_person','remove_object','change_background','photo_color_grade','weather_season','light_time','ai_avatar','natural_beauty','hair_color','hairstyle','professional_headshot','anime_photo','illustration_photo','chibi_person','pet_illustration','pet_humanization','multi_photo_composite','product_background','room_redesign','clothing_recolor']);
export type ToolId = z.infer<typeof ToolId>;
export const Id = z.string().uuid();
export const InputRole = z.enum(['primary','subject_reference','background_reference','style_reference','identity_reference']);
export const JobStatus = z.enum(['queued','processing','completed','failed','cancelled']);
export const Output = z.object({quality:z.enum(['standard','high']).default('standard'),aspect_ratio:z.enum(['preserve','1:1','3:4','4:3','16:9','9:16']).default('preserve')}).strict();
export const InputImage = z.object({image_id:Id,role:InputRole}).strict();
export const EditRequest = z.object({
  tool_id:ToolId,inputs:z.array(InputImage).min(1).max(4),prompt_id:z.string().regex(/^[a-z0-9_]+$/).max(100).optional(),
  parameters:z.record(z.union([z.string().max(500),z.number().min(0).max(1),z.boolean()])).default({}),
  user_instruction:z.string().max(1000).default(''),output:Output.default({}),parent_job_id:Id.optional(),
  idempotency_key:z.string().min(16).max(128).regex(/^[a-zA-Z0-9_-]+$/)
}).strict().superRefine((v,c)=>{
  if(v.inputs.filter(i=>i.role==='primary').length!==1 || v.inputs[0]?.role!=='primary') c.addIssue({code:'custom',path:['inputs'],message:'Exactly one primary image, first in order, is required'});
  if(new Set(v.inputs.map(i=>i.image_id)).size!==v.inputs.length)c.addIssue({code:'custom',path:['inputs'],message:'Duplicate images are not allowed'});
});
export type EditRequest = z.infer<typeof EditRequest>;
export const UploadRequest = z.object({mime_type:z.enum(['image/jpeg','image/png','image/webp']),bytes:z.number().int().positive().max(20*1024*1024)}).strict();
export const ImageCompleteRequest = z.object({image_id:Id}).strict();
export const RecommendRequest = z.object({image_id:Id,top_k:z.number().int().min(1).max(5).default(5)}).strict();
export const CheckoutRequest = z.object({package_id:Id,idempotency_key:z.string().min(16).max(128).regex(/^[a-zA-Z0-9_-]+$/)}).strict();
export const Pagination = z.object({limit:z.coerce.number().int().min(1).max(50).default(20),cursor:z.string().refine(value=>{const parts=value.split('|');return parts.length===2&&z.string().datetime().safeParse(parts[0]).success&&Id.safeParse(parts[1]).success;},'Invalid pagination cursor').optional()}).strict();
export const ModelProfile = z.object({
  profile_id:z.string().min(1),provider:z.string().min(1),model_id:z.string().min(1),adapter_version:z.string().min(1),
  verified_tool_ids:z.array(ToolId).min(1),max_images:z.number().int().min(1).max(4),roles:z.array(InputRole).min(1),
  qualities:z.array(z.enum(['standard','high'])).min(1),aspect_ratios:z.array(Output.shape.aspect_ratio).min(1),
  credits_standard:z.number().int().positive().max(10000),credits_high:z.number().int().positive().max(10000),pricing_version:z.string().min(1)
}).strict();
export type ModelProfile=z.infer<typeof ModelProfile>;
export const RecommendationCandidate=z.object({
  prompt_id:z.string().min(1).max(100),prompt_version:z.number().int().positive(),tool_id:ToolId,
  name_ja:z.string().min(1),intent:z.string().min(1),category:z.string().min(1),
  suitable_subjects:z.array(z.string()),visual_requirements:z.array(z.string()),negative_conditions:z.array(z.string()),expected_result:z.string(),
  minimum_input_count:z.number().int().min(1).max(4),required_input_roles:z.array(InputRole)
}).strict();
export type RecommendationCandidate=z.infer<typeof RecommendationCandidate>;
export const JevRequest=z.object({contract_version:z.literal(CONTRACT_VERSION),request_id:Id,catalog_revision:z.string().min(1).max(128),
  image:z.object({encoding:z.literal('base64'),media_type:z.literal('image/jpeg'),data:z.string().min(1).max(1400000),width:z.number().int().positive().max(768),height:z.number().int().positive().max(768)}).strict(),
  candidates:z.array(RecommendationCandidate).min(1).max(50),top_k:z.number().int().min(1).max(5)
}).strict();
export const JevResponse=z.object({contract_version:z.literal(CONTRACT_VERSION),request_id:Id,catalog_revision:z.string(),model_version:z.string().min(1),inference_ms:z.number().nonnegative().finite(),
  recommendations:z.array(z.object({prompt_id:z.string(),prompt_version:z.number().int().positive(),score:z.number().finite(),reason_code:z.enum(['VISUAL_MATCH','SUBJECT_MATCH'])}).strict()).max(5)
}).strict();
export const ErrorCode=z.enum(['UNAUTHORIZED','NOT_FOUND','INVALID_REQUEST','INVALID_PROMPT','IMAGE_NOT_READY','IMAGE_IN_USE','INSUFFICIENT_CREDITS','IDEMPOTENCY_CONFLICT','JOB_NOT_CANCELLABLE','UNSUPPORTED_CAPABILITY','GENERATION_DISABLED','RATE_LIMITED','SERVICE_UNAVAILABLE','INVALID_SIGNATURE','PAYMENT_MISMATCH','ACCOUNT_RESTRICTED','INTERNAL_ERROR']);
export const ErrorEnvelope=z.object({error:z.object({code:ErrorCode,message:z.string(),request_id:Id,retryable:z.boolean()}).strict()}).strict();
export const EditAccepted=z.object({job_id:Id,status:JobStatus,credits_reserved:z.number().int().nonnegative(),replayed:z.boolean()}).strict();
export const ImageView=z.object({image_id:Id,status:z.enum(['uploading','ready','deleted']),mime_type:z.string(),bytes:z.number().int().nonnegative(),width:z.number().int().nullable(),height:z.number().int().nullable(),preview_url:z.string().url().nullable(),expires_at:z.string()}).strict();
export const UploadResponse=z.object({image_id:Id,upload_url:z.string().url(),expires_at:z.string(),required_headers:z.object({'Content-Type':z.string(),'Content-Length':z.string().regex(/^[1-9][0-9]*$/)})}).strict();
export const JobView=z.object({job_id:Id,tool_id:ToolId,status:JobStatus,stage:z.string(),inputs:z.array(InputImage),parent_job_id:Id.nullable(),result_image_id:Id.nullable(),credits_reserved:z.number().int().nonnegative(),error_code:z.string().nullable(),created_at:z.string(),completed_at:z.string().nullable()}).strict();
export const CreditView=z.object({available:z.number().int().nonnegative(),reserved:z.number().int().nonnegative(),status:z.enum(['active','restricted'])}).strict();
export const PublicRecommendation=z.object({source:z.enum(['model','fallback']),model_version:z.string().optional(),recommendations:z.array(z.object({prompt_id:z.string(),prompt_version:z.number().int(),tool_id:ToolId,name_ja:z.string(),score:z.number().finite().nullable(),reason_code:z.string()})).max(5)}).strict();
export const WorkerTrigger=z.object({contract_version:z.literal(CONTRACT_VERSION),job_id:Id}).strict();
export const WorkerSnapshot=z.object({
  contract_version:z.literal(CONTRACT_VERSION),tool_id:ToolId,tool_version:z.number().int().positive(),prompt_id:z.string(),prompt_version:z.number().int().positive(),
  final_prompt:z.string(),parameters:z.record(z.unknown()),output:Output,execution_type:z.literal('commercial_edit'),execution_version:z.literal(1),model_profile:ModelProfile,
  pricing_version:z.string(),inputs:z.array(InputImage).min(1).max(4)
}).strict();
export type WorkerSnapshot=z.infer<typeof WorkerSnapshot>;
export const DownloadResponse=z.object({download_url:z.string().url(),expires_at:z.string()}).strict();
export const ParameterField=z.object({name:z.string(),type:z.enum(['string','enum']),required:z.boolean(),values:z.array(z.string()).optional()}).strict();
export const ToolView=z.object({tool_id:ToolId,name_ja:z.string(),name_zh:z.string(),category:z.string(),tool_version:z.number().int(),minimum_input_count:z.number().int(),maximum_input_count:z.number().int(),allowed_roles:z.array(InputRole),prompt_id:z.string(),prompt_version:z.number().int(),evaluation_state:z.literal('unverified'),available:z.boolean(),unavailable_reason:z.string().nullable(),parameter_fields:z.array(ParameterField),output_options:z.object({qualities:z.array(z.enum(['standard','high'])),aspect_ratios:z.array(z.string())}),credit_cost:z.object({standard:z.number().int().nullable(),high:z.number().int().nullable()})}).strict();
export const OrderView=z.object({order_id:Id,package_id:Id,credits:z.number().int(),amount_minor:z.number().int(),currency:z.literal('JPY'),status:z.string(),refunded_minor:z.number().int(),created_at:z.string()}).strict();
export const DeleteImageResponse=z.object({image_id:Id,status:z.literal('deleted'),cleanup_pending:z.boolean()}).strict();
export const CheckoutResponse=z.object({order_id:Id,checkout_url:z.string().url()}).strict();
export const CreditPackage=z.object({package_id:Id,credits:z.number().int().positive(),amount_minor:z.number().int().positive(),currency:z.literal('JPY')}).strict();
export const WorkerDrainRequest=z.object({contract_version:z.literal(CONTRACT_VERSION),limit:z.number().int().min(1).max(20).default(5)}).strict();
export const WorkerAck=z.object({contract_version:z.literal(CONTRACT_VERSION),request_id:Id,processed:z.number().int().min(0).max(20),remaining:z.boolean()}).strict();

// Private Worker RPC protocol. Package 1.1.0 is additive; HTTP contract stays 1.0.0.
const WText=z.string().min(1).max(128);
const WInt=z.number().int().nonnegative().safe();
const WTime=z.string().datetime({offset:true});
export const WorkerStage=z.enum(['queued','submitting','waiting_provider','storing','settling','needs_reconciliation','done']);
export const WorkerSupportedVersion=z.object({contract_version:z.literal(CONTRACT_VERSION),execution_type:z.literal('commercial_edit'),execution_version:z.literal(1),provider:WText,adapter_version:WText}).strict();
export const WorkerResultRef=z.object({kind:z.enum(['url','provider_asset']),locator:z.string().min(1).max(4096),provider:WText}).strict();
export const WorkerCost=z.object({currency:z.string().regex(/^[A-Z]{3}$/),amount_minor:WInt,evidence:z.enum(['provider_report','invoice','estimate']),provider_reference:z.string().max(128).nullable()}).strict();
export const WorkerArtifact=z.object({kind:z.enum(['provider_output','result','preview']),storage_key:z.string().min(1).max(1024),sha256:z.string().regex(/^[a-f0-9]{64}$/),mime_type:z.enum(['image/png','image/jpeg','image/webp']),bytes:z.number().int().positive().max(33554432),width:z.number().int().positive(),height:z.number().int().positive()}).strict().superRefine((v,c)=>{if(v.width*v.height>24000000)c.addIssue({code:'custom',message:'Pixel limit exceeded'});if(v.kind==='result'&&v.mime_type!=='image/png'||v.kind==='preview'&&(v.mime_type!=='image/jpeg'||Math.max(v.width,v.height)>768||v.bytes>1048576))c.addIssue({code:'custom',message:'Invalid normalized artifact'});});
export const WorkerInputAsset=z.object({image_id:Id,role:InputRole,position:z.number().int().min(0).max(3),storage_key:z.string().min(1).max(1024),sha256:z.string().regex(/^[a-f0-9]{64}$/),mime_type:z.literal('image/png'),bytes:z.number().int().positive().max(33554432),width:z.number().int().positive(),height:z.number().int().positive()}).strict();
export const WorkerCheckpoint=z.object({provider_state:z.enum(['pending','succeeded','failed','unknown']).nullable(),result_ref:WorkerResultRef.nullable(),result_expires_at:WTime.nullable(),artifacts:z.array(WorkerArtifact).max(3),poll_count:WInt,transport_retry_count:WInt,error_class:WText.nullable()}).strict();
export const WorkerAttempt=z.object({attempt_id:Id,attempt_no:z.number().int().positive(),provider:WText,model_id:z.string().min(1).max(512),adapter_version:WText,provider_request_key:WText,provider_job_id:z.string().min(1).max(512).nullable(),state:z.enum(['prepared','accepted','succeeded','failed','uncertain']),submitted_at:WTime.nullable(),result_ref:WorkerResultRef.nullable(),result_expires_at:WTime.nullable(),poll_count:WInt,transport_retry_count:WInt,estimated_cost:WorkerCost,actual_cost:WorkerCost.nullable()}).strict();
export const WorkerClaim=z.object({job_id:Id,owner_id:Id,status:z.enum(['processing']),stage:WorkerStage,lease_token:Id,lease_version:z.number().int().positive().safe(),lease_expires_at:WTime,recovery_deadline_at:WTime,snapshot:z.record(z.unknown()),input_assets:z.array(WorkerInputAsset).max(4),attempt:WorkerAttempt.nullable(),artifact_manifest:z.array(WorkerArtifact).max(3),preflight_error:WText.nullable(),fresh_submission:z.boolean(),checkpoint:WorkerCheckpoint}).strict();
export const WorkerClaimResponse=z.object({claims:z.array(WorkerClaim).max(20),skipped:z.object({not_due:WInt,leased:WInt,terminal:WInt,unsupported:WInt,backpressure:WInt}).strict()}).strict();
export const WorkerEvidence=z.object({provider_request_key:WText,operation:z.enum(['submit','lookup','fetch']),started_at:WTime,observed_at:WTime,transport_phase:z.enum(['before_send','body_sent_or_unknown','response_received']),http_status:z.number().int().min(100).max(599).nullable(),reason_code:WText}).strict();
export const WorkerWriteAck=z.object({applied:z.boolean(),status:z.literal('processing'),stage:WorkerStage,next_attempt_at:WTime.nullable()}).strict();
export const WorkerCompleteAck=z.object({applied:z.boolean(),status:z.literal('completed'),result_image_id:Id,credits_consumed:WInt}).strict();
export const WorkerFailAck=z.object({applied:z.boolean(),status:z.literal('failed'),credits_released:WInt}).strict();
export const WorkerUncertainAck=z.object({applied:z.boolean(),status:z.literal('processing'),stage:z.literal('needs_reconciliation'),recovery_deadline_at:WTime}).strict();
export const WorkerCleanupClaim=z.object({tasks:z.array(z.object({task_id:Id,storage_key:z.string().min(1).max(1024),reason:WText,lease_token:Id,lease_expires_at:WTime,attempt_count:WInt}).strict()).max(100)}).strict();
