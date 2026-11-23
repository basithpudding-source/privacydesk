-- Between the schema tests and the live checks: nobody is signed in.
select set_config('request.jwt.claim.sub', '', false);
select set_config('request.jwt.claim.aal', '', false);
