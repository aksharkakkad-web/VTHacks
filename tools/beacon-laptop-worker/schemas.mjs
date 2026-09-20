const topics = ['weather','closures','lighting','activity','crime','notices','transit','waiting_places'];
const priorities = ['minimize_walking','minimize_waiting','minimize_cost','minimize_transfers'];
const string = (maxLength=240) => ({type:'string',minLength:1,maxLength});
const object = properties => ({type:'object',properties,required:Object.keys(properties),additionalProperties:false});
const array = (items,maxItems) => ({type:'array',items,maxItems});
const schemas = {
  'student-intent': object({objective:{const:'get_home',type:'string'},priorities:array({type:'string',enum:priorities},4),evidenceRequests:array(object({topic:{type:'string',enum:topics}}),8),clarification:{type:['string','null'],maxLength:160}}),
  'research-intent': object({topics:array({type:'string',enum:topics},8)}),
  'student-explanation': object({snapshotId:string(128),selectedPlanId:string(256),sentences:array(object({text:string(),factIds:array(string(128),1)}),4)}),
};
export function schemaFor(role) { if (!Object.hasOwn(schemas,role)) throw new Error('INVALID_OUTPUT'); return schemas[role]; }
export function validateSchema(value,schema) {
  if (value === null) { if (Array.isArray(schema.type) && schema.type.includes('null')) return; throw new Error('INVALID_OUTPUT'); }
  if (schema.type === 'object') {
    if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).some(k=>!Object.hasOwn(schema.properties,k)) || schema.required.some(k=>!Object.hasOwn(value,k))) throw new Error('INVALID_OUTPUT');
    for (const [k,s] of Object.entries(schema.properties)) validateSchema(value[k],s);
  } else if (schema.type === 'array') {
    if (!Array.isArray(value) || value.length>schema.maxItems) throw new Error('INVALID_OUTPUT');
    for (const item of value) validateSchema(item,schema.items);
  } else if (typeof value !== 'string' || value.length>(schema.maxLength??1000) || value.length<(schema.minLength??0) || schema.enum && !schema.enum.includes(value) || schema.const && schema.const!==value) throw new Error('INVALID_OUTPUT');
}
export function validateOutput(role,value) { validateSchema(value,schemaFor(role)); return value; }
