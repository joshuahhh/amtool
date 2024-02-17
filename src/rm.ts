import { AutomergeUrl } from "@automerge/automerge-repo";
import * as cmd from "cmd-ts";
import { getRepo } from "./shared.js";


export const rm = cmd.command({
  name: "rm",
  description: "delete an automerge document",
  args: {
    doc: cmd.positional({
      displayName: "doc",
      type: cmd.string,
      description: "the document (automerge:url) to delete"
    }),
  },
  handler: async (args) => {
    const repo = getRepo();
    repo.delete(args.doc as AutomergeUrl);
    console.error(`deleted ${args.doc}`);
  }
});
