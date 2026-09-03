import json
from pathlib import Path
source=Path("/workspace/sites/unicenter-control-mvp/app/seed-data.json")
data=json.loads(source.read_text())
def q(v):
    if v is None:return "''"
    return "'"+str(v).replace("'","''")+"'"
def n(v,default=0):
    try:return str(float(v or default))
    except:return str(default)
rows=[]
for x in data["masterPlan"]:rows.append(["plan",x["ID"],x["Action / Activity"],x.get("Workstream"),x.get("Owner"),x.get("Priority"),x.get("Status"),x.get("Phase"),x.get("Day Start"),x.get("Day End"),x.get("% Complete"),0,0,0,0,0,x.get("Success / Exit Criteria"),x.get("Deliverable / Evidence")])
for x in data["actions"]:rows.append(["action",x["Action ID"],x["Corrective Action"],x.get("Domain"),x.get("Owner"),x.get("Priority"),x.get("Status"),"",1,x.get("Due Day"),x.get("% Complete"),0,0,0,0,0,x.get("Escalation / Decision Needed"),x.get("Evidence / Closure Note")])
for x in data["risks"]:rows.append(["risk",x["Risk ID"],x["Risk Statement"],x.get("Domain"),x.get("Owner"),x.get("Rating"),x.get("Status"),"",1,x.get("Due Day"),0,x.get("Likelihood 1–5"),x.get("Impact 1–5"),0,0,0,x.get("Mitigation / Treatment"),x.get("Existing Control")])
for x in data["assessments"]:rows.append(["assessment",x["ID"],x["Control Question / Evidence Test"],x.get("Domain"),x.get("Action Owner"),"Critical" if x.get("Critical?")=="Yes" else "High",x.get("Status"),"",1,x.get("Due Day"),0,0,0,x.get("Current Rating (0–5)"),x.get("Day 45 Target"),x.get("Day 60 Target"),x.get("Immediate Action / Treatment"),x.get("Evidence / Notes")])
for x in data["qbo"]:rows.append(["qbo",x["Work Package"],x.get("Objective") or x["Work Package"],"QBO",x.get("Owner"),"High",x.get("Status"),x["Work Package"],x.get("Day Start"),x.get("Day End"),x.get("% Complete"),0,0,0,0,0,x.get("Acceptance Test"),x.get("Output")])
values=[]
for r in rows:values.append("(" + ",".join([q(r[i]) if i in [0,1,2,3,4,5,6,7,16,17] else n(r[i]) for i in range(18)]) + ")")
sql="insert into public.control_records(type,code,title,domain,owner,priority,status,phase,day_start,day_end,progress,likelihood,impact,current_rating,day45_target,day60_target,details,evidence) values\n"+",\n".join(values)+"\non conflict(type,code) do nothing;\n"
Path("supabase/migrations/002_seed.sql").write_text(sql)
