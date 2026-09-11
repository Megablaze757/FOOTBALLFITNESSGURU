import { bedFilter } from "./lib/reel-music";
console.log(bedFilter("0:a", "1:a", "mix", { totalMs: Number(process.argv[2]) }));
