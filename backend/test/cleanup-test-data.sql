-- Removes the records created by the end-to-end scripts (last names starting with "Test-").
-- docker compose exec -T postgres psql -U schooladmin -d school_erp < backend/test/cleanup-test-data.sql
begin;
create temp table t_adm as select id, "studentId" from "Admission" where "lastName" like 'Test-%';
create temp table t_par as select "A" as id from "_ParentToStudent" where "B" in (select "studentId" from t_adm where "studentId" is not null);
delete from "_ParentToStudent" where "B" in (select "studentId" from t_adm where "studentId" is not null);
delete from "Parent" where id in (select id from t_par);
delete from "Admission" where id in (select id from t_adm);
delete from "Student" where id in (select "studentId" from t_adm where "studentId" is not null);
delete from "Student" where "lastName" like 'Test-%';
select (select count(*) from t_adm) as removed_applications, (select count(*) from t_par) as removed_guardians;
commit;
