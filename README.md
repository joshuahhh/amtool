# amtool

amtool is a CLI for working with remote Automerge repos. so far it does a few useful things. there are many things it doesn't do yet but we can add those as we go.

it's currently hardwired to talk to `wss://sync.automerge.org`, tho you can override that with an `AM_REPO` env var.

## examples of things you can do with it

```sh
# mirror a string at a path in an Automerge document to raw file contents
amtool cp -wr automerge:2Nn5c23EuinsRJ7duZ9ATb1rZTQJ/content doc.md

# mirror the other way around
amtool cp -wr doc.md automerge:2Nn5c23EuinsRJ7duZ9ATb1rZTQJ/content

# mirror a value in Automerge to JSON in a file
amtool cp -w automerge:2Nn5c23EuinsRJ7duZ9ATb1rZTQJ doc.json

# stream some values into Automerge
while true; do
  date
  sleep 1
done | amtool cp -wr - automerge:2Nn5c23EuinsRJ7duZ9ATb1rZTQJ/date

# make a new document and write its url out on stdout
amtool mk

# delete a document
amtool rm automerge:2Nn5c23EuinsRJ7duZ9ATb1rZTQJ
```

## install
use immediately with `npx amtool [...]`.

for a shorter & speedier amtool, `npm i -g amtool`, then `amtool [...]`.

for (minimal) documentation, call without arguments and follow the trail of clues.

## hints
* run with `DEBUG="automerge-repo:*"` for behind-the-scenes logging

## todo
* read file from fs into am bytes?
* tests?
* list all documents? (is that a thing?)
* intelligent two-way sync?
