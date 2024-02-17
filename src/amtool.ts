import * as cmd from "cmd-ts";
import { cp } from "./cp.js";
import { mk } from "./mk.js";
import { rm } from "./rm.js";
import { catchAMTErrors } from "./shared.js";

import packageJson from "../package.json" with { type: "json" };


export async function amtool() {
  await catchAMTErrors(async () => {
    await cmd.run(cmd.subcommands({
      name: "amt",
      version: packageJson.version,
      cmds: { cp, rm, mk },
    }), process.argv.slice(2));
  }, true);
}
