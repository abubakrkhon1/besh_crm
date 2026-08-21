-- Consolidate duplicate requirements while preserving any uploaded documents
-- and upload intents on the best existing request row.
create temporary table application_document_request_dedupe on commit drop as
select
  request.id,
  first_value(request.id) over (
    partition by request.application_id, request.document_type, lower(btrim(request.label))
    order by
      exists (select 1 from public.application_documents document where document.request_id = request.id) desc,
      case request.status when 'accepted' then 4 when 'uploaded' then 3 when 'rejected' then 2 else 1 end desc,
      request.created_at desc,
      request.id
  ) as keeper_id
from public.application_document_requests request;

update public.application_documents document
set request_id = duplicate.keeper_id
from application_document_request_dedupe duplicate
where document.request_id = duplicate.id
  and duplicate.id <> duplicate.keeper_id;

update public.application_document_upload_intents intent
set request_id = duplicate.keeper_id
from application_document_request_dedupe duplicate
where intent.request_id = duplicate.id
  and duplicate.id <> duplicate.keeper_id;

delete from public.application_document_requests request
using application_document_request_dedupe duplicate
where request.id = duplicate.id
  and duplicate.id <> duplicate.keeper_id;

create unique index application_document_requests_unique_requirement_idx
  on public.application_document_requests (
    application_id,
    document_type,
    lower(btrim(label))
  );

