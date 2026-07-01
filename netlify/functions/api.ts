import type { Handler, HandlerEvent } from '@netlify/functions';
import { Pool } from '@neondatabase/serverless';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const JWT_SECRET = process.env.JWT_SECRET || 'dev-only-change-me';
const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
  'Content-Type': 'application/json; charset=utf-8'
};
const ok = (body: unknown, statusCode = 200) => ({ statusCode, headers: cors, body: JSON.stringify(body) });
const fail = (message: string, statusCode = 400, extra: any = {}) => ok({ error: message, ...extra }, statusCode);

const tableColumns: Record<string, string[]> = {
  trucks: ['plate','brand','model','year','vin','euro_class','fuel_type','avg_consumption','tank_liters','odometer_km','status','registration_until','insurance_until'],
  drivers: ['name','phone','email','license_no','license_until','card_no','card_until','adr_until','medical_until','base_salary','status'],
  trailers: ['plate','type','capacity_kg','volume_m3','registration_until','status'],
  customers: ['name','oib','vat_id','email','phone','address','city','country','payment_days'],
  suppliers: ['name','oib','email','phone','address','city','country','category','payment_days'],
  routes: ['name','origin','destination','via','distance_km','duration_h','fuel_liters','toll_estimate','rest_plan'],
  transports: ['customer_id','truck_id','driver_id','trailer_id','route_id','status','order_no','load_date','unload_date','loading_place','unloading_place','cargo_desc','cargo_weight_kg','price','currency','notes'],
  expenses: ['transport_id','driver_id','supplier_id','type','amount','currency','expense_date','description','paid'],
  fuel_entries: ['truck_id','driver_id','entry_date','liters','price_per_liter','odometer_km','station','country'],
  service_records: ['truck_id','service_date','type','odometer_km','amount','supplier_id','description','next_service_date','next_service_km'],
  invoices: ['customer_id','transport_id','invoice_no','issue_date','due_date','status','subtotal','vat_rate','vat_amount','total','currency','notes'],
  offers: ['customer_id','offer_no','issue_date','valid_until','status','route_desc','price','currency','notes'],
  documents: ['entity','entity_id','doc_type','title','file_url','expires_at'],
  notifications: ['title','body','severity','read_at'],
  gps_positions: ['truck_id','driver_id','position_time','lat','lng','speed_kmh','heading','ignition','source','note'],
  tachograph_entries: ['driver_id','truck_id','entry_date','drive_minutes','work_minutes','rest_minutes','availability_minutes','violations','note'],
  payrolls: ['driver_id','period_month','base_salary','per_diem','bonuses','deductions','gross_total','net_total','status','note'],
  cmr_documents: ['transport_id','cmr_no','sender','consignee','carrier','pickup_place','delivery_place','goods_desc','packages','gross_weight_kg','instructions','status'],
  app_settings: ['setting_key','setting_value']
};
const required: Record<string,string[]> = { trucks:['plate'], drivers:['name'], trailers:['plate'], customers:['name'], suppliers:['name'], routes:['name','origin','destination'], transports:['order_no'], expenses:['type','amount'], fuel_entries:['liters','price_per_liter'], invoices:['invoice_no'], offers:['offer_no'], documents:['entity','doc_type','title'], gps_positions:['lat','lng'], tachograph_entries:['entry_date'], payrolls:['period_month'], cmr_documents:['cmr_no'], app_settings:['setting_key','setting_value'] };
const writeRoles = ['admin','dispatcher','accountant'];

type Auth = { userId:string; companyId:string; role:string; email:string; name:string };
function body(event: HandlerEvent){ try { return event.body ? JSON.parse(event.body) : {}; } catch { return {}; } }
function token(event: HandlerEvent){ const h = event.headers.authorization || event.headers.Authorization; return h?.replace(/^Bearer\s+/i,''); }
function sign(u: Auth){ return jwt.sign(u, JWT_SECRET, { expiresIn:'7d' }); }
function auth(event: HandlerEvent): Auth | null { const t = token(event); if(!t) return null; try { return jwt.verify(t, JWT_SECRET) as Auth; } catch { return null; } }
function requireWrite(a: Auth){ if(!writeRoles.includes(a.role)) throw new Error('Nemate dozvolu za izmjene.'); }
async function audit(a: Auth|null, action:string, entity:string, entityId?:string, details:any = {}, ip?:string){
  if(!a) return;
  await pool.query('insert into audit_logs(company_id,user_id,action,entity,entity_id,details,ip) values($1,$2,$3,$4,$5,$6,$7)', [a.companyId,a.userId,action,entity,entityId || null,details,ip || null]).catch(()=>{});
}
async function runSchema(){
  const schema = readFileSync(join(process.cwd(), 'sql/schema.sql'), 'utf8');
  await pool.query(schema);
}
function validate(table:string, data:any){
  for(const f of (required[table] || [])) if(data[f] === undefined || data[f] === null || data[f] === '') throw new Error(`Polje ${f} je obavezno.`);
}
function filterData(table:string, data:any){
  const cols = tableColumns[table];
  const out:Record<string,any> = {};
  for(const c of cols) if(Object.prototype.hasOwnProperty.call(data,c)) out[c] = data[c] === '' ? null : data[c];
  return out;
}
async function list(table:string, a:Auth, q:any){
  const term = q.search || '';
  let where = 'company_id=$1'; const params:any[]=[a.companyId];
  if(term){
    const cols = tableColumns[table].filter(c=>!c.endsWith('_id') && !['year','avg_consumption','tank_liters','odometer_km','capacity_kg','volume_m3','amount','liters','price_per_liter','subtotal','total','vat_amount','price'].includes(c));
    if(cols.length){ params.push(`%${term}%`); where += ' and (' + cols.map(c=>`${c}::text ilike $${params.length}`).join(' or ') + ')'; }
  }
  const r = await pool.query(`select * from ${table} where ${where} order by created_at desc limit 500`, params);
  return r.rows;
}
async function create(table:string, a:Auth, data:any, ip?:string){
  requireWrite(a); validate(table, data); const d = enrichBusinessRules(table, filterData(table, data)); const cols = Object.keys(d);
  const vals = cols.map((_,i)=>`$${i+2}`);
  const r = await pool.query(`insert into ${table}(company_id,${cols.join(',')}) values($1,${vals.join(',')}) returning *`, [a.companyId, ...cols.map(c=>d[c])]);
  await audit(a,'create',table,r.rows[0].id,d,ip); return r.rows[0];
}
async function update(table:string, a:Auth, id:string, data:any, ip?:string){
  requireWrite(a); const d = enrichBusinessRules(table, filterData(table, data)); const cols = Object.keys(d); if(!cols.length) throw new Error('Nema podataka za ažuriranje.');
  const sets = cols.map((c,i)=>`${c}=$${i+3}`).concat(['updated_at=now()']).join(',');
  const r = await pool.query(`update ${table} set ${sets} where id=$1 and company_id=$2 returning *`, [id,a.companyId,...cols.map(c=>d[c])]);
  if(!r.rowCount) throw new Error('Zapis nije pronađen.'); await audit(a,'update',table,id,d,ip); return r.rows[0];
}
async function remove(table:string, a:Auth, id:string, ip?:string){
  requireWrite(a); const r = await pool.query(`delete from ${table} where id=$1 and company_id=$2 returning id`, [id,a.companyId]);
  if(!r.rowCount) throw new Error('Zapis nije pronađen.'); await audit(a,'delete',table,id,{},ip); return { id };
}

async function dashboard(a:Auth){
  const [trucks,drivers,transports,inv,exp,fuel,service,alerts] = await Promise.all([
    pool.query('select count(*)::int n from trucks where company_id=$1',[a.companyId]),
    pool.query('select count(*)::int n from drivers where company_id=$1',[a.companyId]),
    pool.query("select status,count(*)::int n,coalesce(sum(price),0)::float total from transports where company_id=$1 group by status",[a.companyId]),
    pool.query("select status,count(*)::int n,coalesce(sum(total),0)::float total from invoices where company_id=$1 group by status",[a.companyId]),
    pool.query("select coalesce(sum(amount),0)::float total from expenses where company_id=$1 and expense_date >= date_trunc('month',current_date)",[a.companyId]),
    pool.query("select coalesce(sum(total),0)::float total, coalesce(sum(liters),0)::float liters from fuel_entries where company_id=$1 and entry_date >= date_trunc('month',current_date)",[a.companyId]),
    pool.query("select coalesce(sum(amount),0)::float total from service_records where company_id=$1 and service_date >= date_trunc('month',current_date)",[a.companyId]),
    pool.query("select 'Registracija kamiona' type, plate label, registration_until due from trucks where company_id=$1 and registration_until <= current_date + interval '30 day' union all select 'Vozačka/tahograf kartica', name, coalesce(license_until,card_until) from drivers where company_id=$1 and (license_until <= current_date + interval '30 day' or card_until <= current_date + interval '30 day') limit 20",[a.companyId])
  ]);
  return { trucks:trucks.rows[0].n, drivers:drivers.rows[0].n, transports:transports.rows, invoices:inv.rows, monthlyExpenses:exp.rows[0].total, monthlyFuel:fuel.rows[0], monthlyService:service.rows[0].total, alerts:alerts.rows };
}
async function nextNumber(a:Auth, kind:string){
  const year = new Date().getFullYear();
  const map:any = { invoice:['invoices','invoice_no','R'], offer:['offers','offer_no','P'], transport:['transports','order_no','PN'] };
  const m = map[kind]; if(!m) throw new Error('Nepoznat brojač.');
  const r = await pool.query(`select count(*)::int n from ${m[0]} where company_id=$1 and ${m[1]} like $2`, [a.companyId, `${m[2]}-${year}-%`]);
  return { number: `${m[2]}-${year}-${String((r.rows[0].n||0)+1).padStart(4,'0')}` };
}

function enrichBusinessRules(table:string, d:any){
  if(table === 'payrolls'){
    const gross = Number(d.base_salary||0)+Number(d.per_diem||0)+Number(d.bonuses||0)-Number(d.deductions||0);
    d.gross_total = Number(gross.toFixed(2));
    d.net_total = Number((gross*0.76).toFixed(2));
  }
  if(table === 'tachograph_entries'){
    const drive = Number(d.drive_minutes||0), work = Number(d.work_minutes||0), rest = Number(d.rest_minutes||0);
    const v:any[] = [];
    if(drive > 540) v.push({code:'DAILY_DRIVE_9H', message:'Dnevna vožnja prelazi 9 sati; provjeriti iznimku do 10h.'});
    if(drive > 270 && rest < 45) v.push({code:'BREAK_4H30', message:'Nakon 4h30 vožnje potrebna je pauza 45 min.'});
    if(drive + work > 780) v.push({code:'WORKDAY_13H', message:'Radni dan prelazi 13 sati; provjeriti dnevni odmor.'});
    d.violations = v;
  }
  if(table === 'invoices'){
    const sub = Number(d.subtotal||0); const rate = Number(d.vat_rate ?? 25);
    d.vat_amount = Number((sub*rate/100).toFixed(2));
    d.total = Number((sub + d.vat_amount).toFixed(2));
  }
  return d;
}

async function analytics(a:Auth){
  const queries = await Promise.all([
    pool.query("select date_trunc('month', created_at)::date m, coalesce(sum(price),0)::float revenue, count(*)::int transports from transports where company_id=$1 group by 1 order by 1 desc limit 12",[a.companyId]),
    pool.query("select date_trunc('month', expense_date)::date m, coalesce(sum(amount),0)::float expenses from expenses where company_id=$1 group by 1 order by 1 desc limit 12",[a.companyId]),
    pool.query("select t.plate, coalesce(sum(f.liters),0)::float liters, coalesce(sum(f.total),0)::float total from trucks t left join fuel_entries f on f.truck_id=t.id where t.company_id=$1 group by t.plate order by total desc limit 20",[a.companyId]),
    pool.query("select d.name, count(tr.id)::int transports, coalesce(sum(tr.price),0)::float revenue from drivers d left join transports tr on tr.driver_id=d.id where d.company_id=$1 group by d.name order by revenue desc limit 20",[a.companyId]),
    pool.query("select status, count(*)::int n, coalesce(sum(total),0)::float total from invoices where company_id=$1 group by status",[a.companyId]),
    pool.query("select module_id, count(*)::int n, coalesce(sum(amount),0)::float amount from business_feature_records where company_id=$1 group by module_id order by module_id",[a.companyId])
  ]);
  return { monthlyRevenue:queries[0].rows, monthlyExpenses:queries[1].rows, fuelByTruck:queries[2].rows, driverPerformance:queries[3].rows, invoiceStatus:queries[4].rows, featureReports:queries[5].rows };
}

async function backupExport(a:Auth){
  requireWrite(a);
  const tables = Object.keys(tableColumns).concat(['business_feature_records']);
  const data:any = { exportedAt:new Date().toISOString(), companyId:a.companyId, tables:{} };
  for(const t of tables){
    const r = await pool.query(`select * from ${t} where company_id=$1 order by created_at desc limit 10000`, [a.companyId]);
    data.tables[t] = r.rows;
  }
  const text = JSON.stringify(data);
  await pool.query('insert into backup_exports(company_id,export_name,format,status,size_bytes,created_by) values($1,$2,$3,$4,$5,$6)', [a.companyId, `backup-${Date.now()}.json`, 'json', 'created', Buffer.byteLength(text), a.userId]);
  await audit(a,'backup','backup_exports',undefined,{sizeBytes:Buffer.byteLength(text)});
  return data;
}

async function listUsers(a:Auth){
  if(a.role !== 'admin') throw new Error('Samo administrator može upravljati korisnicima.');
  const r = await pool.query('select id,name,email,role,active,created_at from users where company_id=$1 order by created_at desc',[a.companyId]);
  return r.rows;
}
async function createUser(a:Auth, data:any){
  if(a.role !== 'admin') throw new Error('Samo administrator može dodavati korisnike.');
  if(!data.name || !data.email || !data.password) throw new Error('Ime, email i lozinka su obavezni.');
  const hash = await bcrypt.hash(data.password, 12);
  const r = await pool.query('insert into users(company_id,name,email,password_hash,role,active) values($1,$2,$3,$4,$5,$6) returning id,name,email,role,active,created_at',[a.companyId,data.name,data.email,hash,data.role||'viewer',data.active !== false]);
  await audit(a,'create','users',r.rows[0].id,{email:data.email,role:data.role});
  return r.rows[0];
}
async function updateUser(a:Auth, id:string, data:any){
  if(a.role !== 'admin') throw new Error('Samo administrator može uređivati korisnike.');
  const fields:string[]=[]; const vals:any[]=[id,a.companyId];
  for(const k of ['name','email','role','active']) if(Object.prototype.hasOwnProperty.call(data,k)){ vals.push(data[k]); fields.push(`${k}=$${vals.length}`); }
  if(data.password){ vals.push(await bcrypt.hash(data.password,12)); fields.push(`password_hash=$${vals.length}`); }
  if(!fields.length) throw new Error('Nema podataka za ažuriranje.');
  const r = await pool.query(`update users set ${fields.join(',')} where id=$1 and company_id=$2 returning id,name,email,role,active,created_at`, vals);
  await audit(a,'update','users',id,{role:data.role,active:data.active}); return r.rows[0];
}

async function featureModules(){ const r = await pool.query('select * from business_feature_modules where active=true order by id'); return r.rows; }
async function featureRecords(a:Auth, moduleId:string){ const r = await pool.query('select r.*, u.name assigned_name from business_feature_records r left join users u on u.id=r.assigned_to where r.company_id=$1 and r.module_id=$2 order by r.created_at desc',[a.companyId,moduleId]); return r.rows; }
async function createFeatureRecord(a:Auth, moduleId:string, data:any){
  requireWrite(a); if(!data.title) throw new Error('Naslov je obavezan.');
  const r = await pool.query('insert into business_feature_records(company_id,module_id,title,status,priority,assigned_to,amount,due_date,data) values($1,$2,$3,$4,$5,$6,$7,$8,$9) returning *',[a.companyId,moduleId,data.title,data.status||'open',data.priority||'normal',data.assigned_to||null,data.amount||0,data.due_date||null,data.data||{}]);
  await audit(a,'create','business_feature_records',r.rows[0].id,{moduleId,data}); return r.rows[0];
}
async function updateFeatureRecord(a:Auth, id:string, data:any){
  requireWrite(a); const r = await pool.query('update business_feature_records set title=$3,status=$4,priority=$5,assigned_to=$6,amount=$7,due_date=$8,data=$9,updated_at=now() where id=$1 and company_id=$2 returning *',[id,a.companyId,data.title,data.status||'open',data.priority||'normal',data.assigned_to||null,data.amount||0,data.due_date||null,data.data||{}]);
  if(!r.rowCount) throw new Error('Zapis nije pronađen.'); await audit(a,'update','business_feature_records',id,data); return r.rows[0];
}
async function deleteFeatureRecord(a:Auth, id:string){ requireWrite(a); const r=await pool.query('delete from business_feature_records where id=$1 and company_id=$2 returning id',[id,a.companyId]); if(!r.rowCount) throw new Error('Zapis nije pronađen.'); await audit(a,'delete','business_feature_records',id,{}); return {id}; }

export const handler: Handler = async (event) => {
  if(event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: cors, body: '' };
  const path = (event.path || '').replace(/^\/\.netlify\/functions\/api/,'').replace(/^\/api/,'') || '/';
  const parts = path.split('/').filter(Boolean);
  const ip = event.headers['x-forwarded-for'] || event.headers['client-ip'];
  try {
    if(parts[0] === 'setup') { await runSchema(); return ok({ ok:true, message:'Baza je inicijalizirana.' }); }
    if(parts[0] === 'auth' && parts[1] === 'register' && event.httpMethod === 'POST'){
      const b = body(event); if(!b.companyName || !b.oib || !b.email || !b.password || !b.name) return fail('Nedostaju obavezna polja.',422);
      const hash = await bcrypt.hash(b.password, 12);
      const client = await pool.connect();
      try { await client.query('begin');
        const c = await client.query('insert into companies(name,oib,email,phone,address,city,country) values($1,$2,$3,$4,$5,$6,$7) returning *',[b.companyName,b.oib,b.email,b.phone||'',b.address||'',b.city||'',b.country||'HR']);
        const u = await client.query('insert into users(company_id,name,email,password_hash,role) values($1,$2,$3,$4,$5) returning id,company_id,name,email,role',[c.rows[0].id,b.name,b.email,hash,'admin']);
        await client.query('commit'); const payload = { userId:u.rows[0].id, companyId:u.rows[0].company_id, role:u.rows[0].role, email:u.rows[0].email, name:u.rows[0].name };
        return ok({ token:sign(payload), user:payload, company:c.rows[0] },201);
      } catch(e){ await client.query('rollback'); throw e; } finally { client.release(); }
    }
    if(parts[0] === 'auth' && parts[1] === 'login' && event.httpMethod === 'POST'){
      const b = body(event); const r = await pool.query('select u.*, c.name company_name from users u join companies c on c.id=u.company_id where lower(u.email)=lower($1) and u.active=true',[b.email]);
      if(!r.rowCount || !(await bcrypt.compare(b.password || '', r.rows[0].password_hash))) return fail('Neispravan email ili lozinka.',401);
      const payload = { userId:r.rows[0].id, companyId:r.rows[0].company_id, role:r.rows[0].role, email:r.rows[0].email, name:r.rows[0].name };
      return ok({ token:sign(payload), user:payload, company:{ id:r.rows[0].company_id, name:r.rows[0].company_name }});
    }
    const a = auth(event); if(!a) return fail('Prijava je potrebna.',401);
    if(parts[0] === 'me'){
      const [u,c] = await Promise.all([pool.query('select id,name,email,role from users where id=$1',[a.userId]), pool.query('select * from companies where id=$1',[a.companyId])]);
      return ok({ user:u.rows[0], company:c.rows[0] });
    }
    if(parts[0] === 'dashboard') return ok(await dashboard(a));
    if(parts[0] === 'next-number') return ok(await nextNumber(a, parts[1] || 'transport'));
    if(parts[0] === 'audit') { const r = await pool.query('select * from audit_logs where company_id=$1 order by created_at desc limit 200',[a.companyId]); return ok(r.rows); }
    if(parts[0] === 'analytics') return ok(await analytics(a));
    if(parts[0] === 'backup' && event.httpMethod === 'POST') return ok(await backupExport(a));
    if(parts[0] === 'admin' && parts[1] === 'users') {
      if(event.httpMethod === 'GET') return ok(await listUsers(a));
      if(event.httpMethod === 'POST') return ok(await createUser(a, body(event)));
      if(event.httpMethod === 'PUT') return ok(await updateUser(a, parts[2], body(event)));
    }
    if(parts[0] === 'feature-modules') return ok(await featureModules());
    if(parts[0] === 'feature-records') {
      if(event.httpMethod === 'GET') return ok(await featureRecords(a, parts[1] || '1'));
      if(event.httpMethod === 'POST') return ok(await createFeatureRecord(a, parts[1] || '1', body(event)));
      if(event.httpMethod === 'PUT') return ok(await updateFeatureRecord(a, parts[1], body(event)));
      if(event.httpMethod === 'DELETE') return ok(await deleteFeatureRecord(a, parts[1]));
    }
    const table = parts[0]; if(!tableColumns[table]) return fail('Ruta ne postoji.',404);
    if(event.httpMethod === 'GET') return ok(await list(table,a,event.queryStringParameters || {}));
    if(event.httpMethod === 'POST') return ok(await create(table,a,body(event),ip),201);
    if(event.httpMethod === 'PUT') return ok(await update(table,a,parts[1],body(event),ip));
    if(event.httpMethod === 'DELETE') return ok(await remove(table,a,parts[1],ip));
    return fail('Metoda nije podržana.',405);
  } catch (e:any) {
    console.error(e); return fail(e.message || 'Greška poslužitelja.', e.code === '23505' ? 409 : 500);
  }
};
