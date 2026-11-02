import * as vscode from "vscode";
import * as assert from "assert";

import { isReadAllowed, readIncludedFile, ReadContext } from "../readFile";
import { getDocUri } from "./helper";

const uri = (s: string) => vscode.Uri.parse(s, true);

suite("Should only read included files the window may read", () => {
  const local: ReadContext = {
    folders: [uri("file:///p/repo")],
    documents: [],
    trusted: true,
  };

  test("Reads inside and outside the folders on a trusted machine", () => {
    assert.ok(isReadAllowed(uri("file:///p/repo/a.vcl"), local));
    assert.ok(isReadAllowed(uri("file:///p/shared/a.vcl"), local));
  });

  test("Reads only inside the folders when untrusted", () => {
    const untrusted = { ...local, trusted: false };
    assert.ok(isReadAllowed(uri("file:///p/repo/sub/a.vcl"), untrusted));
    assert.ok(!isReadAllowed(uri("file:///p/shared/a.vcl"), untrusted));
    assert.ok(!isReadAllowed(uri("file:///etc/passwd"), untrusted));
    // A sibling folder whose name starts with the folder's.
    assert.ok(!isReadAllowed(uri("file:///p/repo-other/a.vcl"), untrusted));
    assert.ok(!isReadAllowed(uri("file:///p/repo"), untrusted));
  });

  test("Stays on the window's machines", () => {
    const remote: ReadContext = {
      folders: [uri("vscode-remote://ssh-remote+a/home/u/repo")],
      documents: [uri("untitled:Untitled-1")],
      trusted: true,
    };
    assert.ok(
      isReadAllowed(uri("vscode-remote://ssh-remote+a/etc/x.vcl"), remote),
    );
    // A Windows drive include in an untitled document resolves to file:,
    // the local disk, which this remote window does not use.
    assert.ok(!isReadAllowed(uri("file:///c%3A/x.vcl"), remote));
    assert.ok(
      !isReadAllowed(uri("vscode-remote://ssh-remote+b/etc/x.vcl"), remote),
    );
    // Unless a local file is open in the window.
    const withLocalFile = {
      ...remote,
      documents: [uri("file:///Users/u/main.vcl")],
    };
    assert.ok(isReadAllowed(uri("file:///c%3A/x.vcl"), withLocalFile));
  });

  test("Reads only inside the folders on virtual file systems", () => {
    const githubDev: ReadContext = {
      folders: [uri("vscode-vfs://github/owner/repo")],
      documents: [],
      trusted: true,
    };
    assert.ok(
      isReadAllowed(uri("vscode-vfs://github/owner/repo/a.vcl"), githubDev),
    );
    assert.ok(
      !isReadAllowed(uri("vscode-vfs://github/other/private/a.vcl"), githubDev),
    );
  });

  test("Compares Windows drive paths case-insensitively", () => {
    const windows: ReadContext = {
      folders: [uri("file:///c%3A/Work/repo")],
      documents: [],
      trusted: false,
    };
    assert.ok(isReadAllowed(uri("file:///C%3A/work/REPO/a.vcl"), windows));
  });

  test("Refuses paths that are not normalized, queries and fragments", () => {
    assert.ok(!isReadAllowed(uri("file:///p/repo/../x.vcl"), local));
    assert.ok(!isReadAllowed(uri("file:///p/repo/./x.vcl"), local));
    assert.ok(!isReadAllowed(uri("file:///p/repo/x.vcl?q"), local));
    assert.ok(!isReadAllowed(uri("file:///p/repo/x.vcl#f"), local));
  });

  test("Reads files in the workspace, and nothing else", async () => {
    const none = new vscode.CancellationTokenSource().token;
    const text = await readIncludedFile(
      getDocUri("symbolsIncludeModule.vcl").toString(),
      none,
    );
    assert.equal(typeof text, "string");
    // A directory, a missing file, and a string that is not a URI.
    const folder = vscode.workspace.workspaceFolders?.[0]?.uri;
    assert.ok(folder);
    assert.equal(
      await readIncludedFile(
        vscode.Uri.joinPath(folder, "..").toString(),
        none,
      ),
      null,
    );
    assert.equal(
      await readIncludedFile(getDocUri("missing.vcl").toString(), none),
      null,
    );
    assert.equal(await readIncludedFile("not a uri", none), null);
  });

  test("Does not read for a cancelled request", async () => {
    const source = new vscode.CancellationTokenSource();
    source.cancel();
    assert.equal(
      await readIncludedFile(
        getDocUri("symbolsIncludeModule.vcl").toString(),
        source.token,
      ),
      null,
    );
  });
});
