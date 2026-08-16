import { durationTextToHours } from "../lib/biometrics";
for (const t of ["7 hr 32 min","7h 32m","7 hours 32 minutes","45 min","27000 sec","7:32","7.5","","abc"])
  console.log(JSON.stringify(t).padEnd(24), durationTextToHours(t));
