import {createClient} from "@/lib/supabase/server";

const fields=["customer_name","project_name","contract_amount","billing_amount","billing_submission_date","invoice_number","invoice_date","due_date","amount_collected","closed_date","status","last_follow_up_date","next_follow_up_date","promise_to_pay_date","expected_collection_amount","priority","responsible_person","customer_contact","next_action","escalation_level","issues"] as const;
const nullableDates=new Set(["billing_submission_date","invoice_date","due_date","closed_date","last_follow_up_date","next_follow_up_date","promise_to_pay_date"]);
const numeric=new Set(["contract_amount","billing_amount","amount_collected","expected_collection_amount"]);

function clean(value:Record<string,unknown>){
  return Object.fromEntries(fields.map(key=>{
    const raw=value[key];
    if(nullableDates.has(key))return[key,raw||null];
    if(numeric.has(key))return[key,raw===""||raw==null?(key==="billing_amount"?null:0):Number(raw)];
    return[key,String(raw??"").trim()];
  }));
}

export async function GET(){
  const supabase=await createClient();
  const{data:{user}}=await supabase.auth.getUser();
  if(!user)return Response.json({error:"Unauthorized"},{status:401});
  const[{data:me,error:profileError},{data:records,error:recordsError}]=await Promise.all([
    supabase.from("profiles").select("role").eq("id",user.id).single(),
    supabase.from("ar_receivables").select("*").order("updated_at",{ascending:false})
  ]);
  const error=profileError||recordsError;
  if(error)return Response.json({error:error.message},{status:500});
  return Response.json({role:me.role,records:records||[]});
}

export async function POST(request:Request){
  const supabase=await createClient();
  const{data:{user}}=await supabase.auth.getUser();
  if(!user)return Response.json({error:"Unauthorized"},{status:401});
  const{data:me}=await supabase.from("profiles").select("role").eq("id",user.id).single();
  if(!me||me.role==="Viewer")return Response.json({error:"You have view-only access."},{status:403});
  const body=await request.json();
  const value=clean(body.value||{});
  if(!value.customer_name)return Response.json({error:"Customer name is required."},{status:400});
  const result=body.value?.id
    ?await supabase.from("ar_receivables").update(value).eq("id",body.value.id)
    :await supabase.from("ar_receivables").insert(value);
  if(result.error)return Response.json({error:result.error.message},{status:400});
  return GET();
}

