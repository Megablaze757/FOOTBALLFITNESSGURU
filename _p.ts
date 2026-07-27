import { writeFileSync } from "node:fs";
import { buildDemoCardSvg } from "./lib/demo-card";
writeFileSync("_demo-readiness.svg", buildDemoCardSvg({ screen: "readiness" }));
writeFileSync("_demo-program.svg", buildDemoCardSvg({ screen: "program" }));
