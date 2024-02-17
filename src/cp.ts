import * as cmd from "cmd-ts";
import rlP from "node:readline/promises";
import { AMTError, Location, LocationAutomerge, LocationFile, assertNever, catchAMTErrors, getAtPath, getRepo, parseLocation, stringifyLocation, wait, writeToLocation } from "./shared.js";
import chokidar from "chokidar";
import fsP from "node:fs/promises";

export const cp = cmd.command({
  name: "cp",
  description: "copy a value from an automerge document to a file or vice versa",
  args: {
    src: cmd.positional({
      displayName: "src",
      type: cmd.string,
      description: "the source location (automerge:url[/path] or a file path or - for stdin)"
    }),
    dst: cmd.positional({
      displayName: "dst",
      type: cmd.string,
      description: "the destination location (automerge:url[/path] or a file path or - for stdout)"
    }),
    watch: cmd.flag({
      type: cmd.boolean,
      long: "watch",
      short: "w",
      description: "watch the source for changes and update the destination"
    }),
    raw: cmd.flag({
      type: cmd.boolean,
      long: "raw",
      short: "r",
      description: "read/write the value as a raw string or bytes, not as json"
    }),
  },
  handler: async (args) => {
    const src = parseLocation(args.src);
    const dst = parseLocation(args.dst);
    if (src.type === "automerge") {
      await cpFromAutomerge(src, dst, args.watch, args.raw);
    } else if (src.type === "file") {
      await cpFromFile(src, dst, args.watch, args.raw);
    } else if (src.type === "pipe") {
      await cpFromPipe(dst, args.watch, args.raw);
    } else {
      assertNever(src);
    }
  }
});

async function cpFromAutomerge(src: LocationAutomerge, dst: Location, watch: boolean, raw: boolean) {
  if (raw && dst.type === "automerge") {
    throw new AMTError("raw copy from automerge to automerge doesn't really make sense");
  }

  async function onDoc(doc: any) {
    const value = getAtPath(doc, src.path);
    await writeToLocation(dst, value, raw);
    if (dst.type !== "pipe") {
      console.error(`wrote ${stringifyLocation(src)} to ${stringifyLocation(dst)}`);
    }
  }

  const repo = getRepo();
  const handle = repo.find(src.docUrl);

  if (watch) {
    handle.addListener("change", async (e) => {
      catchAMTErrors(async () => {
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
    await wait(500);
    process.exit(0);
  }
}

async function cpFromFile(src: LocationFile, dst: Location, watch: boolean, raw: boolean) {
  async function onFile() {
    const contents = await fsP.readFile(src.path, "utf8");
    const value = raw ? contents : JSON.parse(contents);
    await writeToLocation(dst, value, raw);
    if (dst.type !== "pipe") {
      console.error(`wrote ${stringifyLocation(src)} to ${stringifyLocation(dst)}`);
    }
  }

  if (watch) {
    chokidar.watch(src.path).on('all', () => {
      catchAMTErrors(async () => {
        await onFile();
      }, false);
    });
  } else {
    await onFile();
    await wait(500);
    process.exit(0);
  }
}

async function cpFromPipe(dst: Location, watch: boolean, raw: boolean) {
  async function onPipeData(contents: string) {
    const value = raw ? contents : JSON.parse(contents);
    await writeToLocation(dst, value, raw);
    if (dst.type !== "pipe") {
      console.error(`wrote ${watch ? 'line of stdin' : 'stdin'} to ${stringifyLocation(dst)}`);
    }
  };

  if (watch) {
    const readInterface = rlP.createInterface(process.stdin);
    readInterface.on('line', (line) => {
      catchAMTErrors(async () => {
        await onPipeData(line);
      }, false);
    });
    readInterface.on('close', async () => {
      await wait(500);
      process.exit(0);
    });
  } else {
    const chunks = [];
    for await (const chunk of process.stdin) {
      chunks.push(chunk);
    }
    const data = Buffer.concat(chunks).toString('utf8');
    await writeToLocation(dst, data, raw);
    await wait(500);
    process.exit(0);
  }
}
