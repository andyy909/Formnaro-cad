const object=(properties,required=[])=>({type:'object',additionalProperties:false,properties,required});
const jobId={type:'string',minLength:1,maxLength:200};
export const CAD_JOB_STATUS_SCHEMA=object({jobId});
export const CAD_JOB_TARGET_SCHEMA=object({jobId},['jobId']);
export const CAD_SAVE_SCHEMA=object({revision:{type:'string',pattern:'^[0-9a-f]{16}$'},filename:{type:'string',minLength:6,maxLength:220,pattern:'^[^<>:"/\\\\|?*\\u0000-\\u001f]+\\.(ocad|fnpack)$'},format:{enum:['ocad','fnpack']}},['revision']);
export const CAD_INTERMEDIATE_DISPLAY_SCHEMA={enum:['inherit','final']};
