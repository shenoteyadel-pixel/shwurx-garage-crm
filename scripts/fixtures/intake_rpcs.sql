-- Rehearsal fixture: exact definitions of the production intake RPCs, captured
-- read-only via pg_get_functiondef. No credentials, no customer rows.
--
-- Return contract (both functions): json
--   success -> {"ok": true,  "id": "<uuid>"}
--   failure -> {"ok": false, "error": "missing_name" | "missing_phone" | "missing_contact"}
-- Routes treat a response as persisted ONLY when ok = true AND id is present.
--
-- Schema dependencies: public.leads(id uuid, name, phone, email, message,
-- service_interest, source, metadata jsonb) and public.appointments(id uuid,
-- name, phone, email, vehicle_make, vehicle_model, vehicle_year, plate_number,
-- service_interest, preferred_date date, preferred_time, notes, source, metadata jsonb).
--
-- NOT CAPTURED: the production EXECUTE grants. The read-only grant query failed
-- (integration tool error) and was not retried. The grants below are the
-- intended least-privilege setup for local rehearsal; verify them against
-- production with:
--   select grantee, privilege_type from information_schema.routine_privileges
--   where routine_schema = 'public' and routine_name in ('submit_lead','submit_appointment');

CREATE OR REPLACE FUNCTION public.submit_lead(p_name text, p_phone text DEFAULT NULL::text, p_email text DEFAULT NULL::text, p_message text DEFAULT NULL::text, p_service_interest text DEFAULT NULL::text, p_source text DEFAULT 'website'::text, p_metadata jsonb DEFAULT '{}'::jsonb)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_id uuid;
begin
  if (p_phone is null or length(trim(p_phone)) = 0)
     and (p_email is null or length(trim(p_email)) = 0) then
    return json_build_object('ok', false, 'error', 'missing_contact');
  end if;
  insert into public.leads (name, phone, email, message, service_interest, source, metadata)
  values (left(p_name,160), left(p_phone,40), left(p_email,160), left(p_message,2000),
          left(p_service_interest,160), left(coalesce(p_source,'website'),64), coalesce(p_metadata,'{}'::jsonb))
  returning id into v_id;
  return json_build_object('ok', true, 'id', v_id);
end; $function$;

CREATE OR REPLACE FUNCTION public.submit_appointment(p_name text, p_phone text, p_email text DEFAULT NULL::text, p_vehicle_make text DEFAULT NULL::text, p_vehicle_model text DEFAULT NULL::text, p_vehicle_year text DEFAULT NULL::text, p_plate_number text DEFAULT NULL::text, p_service_interest text DEFAULT NULL::text, p_preferred_date date DEFAULT NULL::date, p_preferred_time text DEFAULT NULL::text, p_notes text DEFAULT NULL::text, p_source text DEFAULT 'website'::text, p_metadata jsonb DEFAULT '{}'::jsonb)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_id uuid;
begin
  if p_name is null or length(trim(p_name)) = 0 then
    return json_build_object('ok', false, 'error', 'missing_name');
  end if;
  if p_phone is null or length(trim(p_phone)) = 0 then
    return json_build_object('ok', false, 'error', 'missing_phone');
  end if;
  insert into public.appointments
    (name, phone, email, vehicle_make, vehicle_model, vehicle_year, plate_number,
     service_interest, preferred_date, preferred_time, notes, source, metadata)
  values
    (left(p_name,160), left(p_phone,40), left(p_email,160), left(p_vehicle_make,80),
     left(p_vehicle_model,80), left(p_vehicle_year,10), left(p_plate_number,20),
     left(p_service_interest,160), p_preferred_date, left(p_preferred_time,40),
     left(p_notes,2000), left(coalesce(p_source,'website'),64), coalesce(p_metadata,'{}'::jsonb))
  returning id into v_id;
  return json_build_object('ok', true, 'id', v_id);
end; $function$;

-- Intended rehearsal grants (unverified against production, see note above).
REVOKE ALL ON FUNCTION public.submit_lead(text,text,text,text,text,text,jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.submit_appointment(text,text,text,text,text,text,text,text,date,text,text,text,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.submit_lead(text,text,text,text,text,text,jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.submit_appointment(text,text,text,text,text,text,text,text,date,text,text,text,jsonb) TO service_role;
