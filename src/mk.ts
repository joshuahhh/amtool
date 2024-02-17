import * as cmd from "cmd-ts";
import { getRepo, wait } from "./shared.js";


export const mk = cmd.command({
  name: "mk",
  description: "create a new automerge document",
  args: { },
  handler: async () => {
    const repo = getRepo();
    const handle = await repo.create();
    console.log(handle.url);
    await wait(500);
    process.exit(0);
  }
});
