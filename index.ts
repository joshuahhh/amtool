import { AutomergeUrl, Repo } from "@automerge/automerge-repo";
import { BrowserWebSocketClientAdapter } from "@automerge/automerge-repo-network-websocket";
import fsP from "node:fs/promises"

import * as cmd from "cmd-ts";

// examples:

// watch the path and write it out as a string to index.md
//   amt cp -w automerge:2Nn5c23EuinsRJ7duZ9ATb1rZTQJ/content index.md

// visa versa
//   amt cp -w index.md automerge:2Nn5c23EuinsRJ7duZ9ATb1rZTQJ/content

// write out the path, once, as JSON
//   amt cp -w automerge:2Nn5c23EuinsRJ7duZ9ATb1rZTQJ --json out.json
// (would have errored otherwise, if it's not a string)

// make a new document and write its url out on stdout
//   amt mk

// delete a document
//   amt rm

class AMTError extends Error { }

type Location = LocationAM | LocationFS | LocationPipe;
type LocationAM = { type: "automerge", docUrl: AutomergeUrl, path: string[] };
type LocationFS = { type: "file", path: string };
type LocationPipe = { type: "pipe" };

function parseLocation(s: string): Location {
  if (s === "-") {
    return { type: "pipe" };
  } else if (s.startsWith("automerge:")) {
    const [docUrl, ...path] = s.split("/");
    return { type: "automerge", docUrl: docUrl as AutomergeUrl, path };
  } else {
    return { type: "file", path: s };
  }
}

function stringifyLocation(l: Location): string {
  if (l.type === "automerge") {
    return [l.docUrl, ...l.path].join("/");
  } else if (l.type === "file") {
    return l.path;
  } else {
    return l.type;
  }
}

function followPath(doc: unknown, path: string[]): unknown {
  let value: any = doc;
  for (const key of path) {
    value = value[key];
  }
  return value;
}

async function oneMoment() {
  return new Promise((resolve) => setTimeout(resolve, 500));
}

// AM -> FS, no json
//   AM path must lead to string, write it out raw
//   writeToLocation gets FS, a string, json = false
// AM -> FS, json
//   AM path can lead to any value, write it out as JSON
//   writeToLocation gets FS, a value, json = true
// FS -> AM, no json
//   FS path can lead to any contents, AM path must not be root, write it out as string val
//   writeToLocation gets AM, a string, json = false
// FS -> AM, json
//   FS path must be json-parseable, AM path must be compatible with parsed val, write it out as parsed val
//   writeToLocation gets AM, a value, json = true
// AM -> AM, no json
//   AM src path can lead to any value, AM dst path must be compatible
//   writeToLocation gets AM, a value, json = false
// AM -> AM, json
//   not allowed?

// so AM locations ignore json

async function writeToLocation(dst: Location, val: unknown, json: boolean, repo: Repo) {
  if (dst.type === "file" || dst.type === "pipe") {
    let stringVal: string;
    if (json) {
      stringVal = dst.type === "pipe" ? JSON.stringify(val) : JSON.stringify(val, null, 2);
    } else if (typeof val !== "string") {
      throw new AMTError("value must be a string to write to a file");
      // throw new AMTError(`value at ${stringifyLocation(src)} is not a string`);
    } else {
      stringVal = val;
    }

    if (dst.type === "pipe") {
      process.stdout.write(stringVal + "\n");
    } else {
      fsP.writeFile(dst.path, stringVal);
    }
  } else if (dst.type === "automerge") {
    const handle = repo.find(dst.docUrl);
    handle.change((doc: any) => {
      if (dst.path.length === 0) {
        // TODO: special case for no path?
        if (!(typeof val === "object" && val !== null)) {
          throw new AMTError("only an object can be written to a document root");
        }
        for (const key in val) {
          doc[key] = (val as any)[key];
        }
      } else {
        let doclet = doc;
        for (const key of dst.path.slice(0, -1)) {
          doclet = doclet[key];
        }
        doclet[dst.path[dst.path.length - 1]] = val;
      }
    });
  }
}

async function errorWrapper(f: () => Promise<void>, fatal: boolean = true) {
  try {
    await f();
  } catch (e) {
    if (e instanceof AMTError) {
      console.error("error: " + e.message);
      if (fatal) {
        process.exit(1);
      }
    } else {
      throw e;
    }
  }
}

function getRepo(): Repo {
  return new Repo({
    network: [
      new BrowserWebSocketClientAdapter("wss://sync.automerge.org"),
    ],
  });
}

const cp = cmd.command({
  name: "cp",
  description: "copy a value from an automerge document to a file or vice versa",
  args: {
    src: cmd.positional({
      displayName: "src",
      type: cmd.string,
      description: "the source location (automerge:url[/path] or a file path)"
    }),
    dst: cmd.positional({
      displayName: "dst",
      type: cmd.string,
      description: "the destination location (automerge:url[/path] or a file path)"
    }),
    watch: cmd.flag({
      type: cmd.boolean,
      long: "watch",
      short: "w",
      description: "watch the source for changes and update the destination"
    }),
    json: cmd.flag({
      type: cmd.boolean,
      long: "json",
      description: "read/write the value as JSON, not a raw string"
    }),
  },
  handler: async (args) => {
    const src = parseLocation(args.src);
    const dst = parseLocation(args.dst);
    if (src.type === "automerge") {
      await cpFromAM(src, dst, args.watch, args.json);
    } else {
      throw new AMTError(`unsupported copy from ${src.type} to ${dst.type}`);
    }
    // TODO
  }
});

async function cpFromAM(src: LocationAM, dst: Location, watch: boolean, json: boolean) {
  const repo = getRepo();
  const handle = repo.find(src.docUrl);

  async function onDoc(doc: any) {
    const value = followPath(doc, src.path);
    await writeToLocation(dst, value, json, repo);
    if (dst.type !== "pipe") {
      console.error(`wrote ${stringifyLocation(src)} to ${stringifyLocation(dst)}`);
    }
  }

  if (watch) {
    handle.addListener("change", async (e) => {
      errorWrapper(async () => {
        await onDoc(e.doc);
      }, false);
    });
  } else {
    const doc = await handle.doc();
    if (!doc) {
      throw new AMTError(`document ${src.docUrl} not found`);
    } else {
      await onDoc(doc);
    }
    await oneMoment();
    process.exit(0);
  }
}

const rm = cmd.command({
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

const mk = cmd.command({
  name: "mk",
  description: "create a new automerge document",
  args: { },
  handler: async () => {
    const repo = getRepo();
    const handle = await repo.create();
    console.log(handle.url);
    await oneMoment();
    process.exit(0);
  }
});

errorWrapper(async () => {
  await cmd.run(cmd.subcommands({
    name: "amt",
    cmds: { cp, rm, mk },
  }), process.argv.slice(2));
}, true);
