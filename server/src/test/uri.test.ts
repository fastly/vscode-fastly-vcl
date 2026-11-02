import assert from "node:assert/strict";
import { test } from "node:test";

import { dirnameUri, isAbsolutePath, resolveUri, uriKey } from "../shared/uri";

test("dirnameUri returns the directory with a trailing slash", () => {
  assert.equal(dirnameUri("file:///a/b/main.vcl"), "file:///a/b/");
  assert.equal(
    dirnameUri("vscode-vfs://github/fastly/repo/vcl/main.vcl"),
    "vscode-vfs://github/fastly/repo/vcl/",
  );
});

test("dirnameUri is null for URIs without a path", () => {
  assert.equal(dirnameUri("untitled:Untitled-1"), null);
  assert.equal(dirnameUri("not a uri"), null);
});

test("resolveUri resolves relative targets against the directory", () => {
  assert.equal(resolveUri("mod.vcl", "file:///a/b/"), "file:///a/b/mod.vcl");
  assert.equal(
    resolveUri("sub/mod.vcl", "file:///a/b/"),
    "file:///a/b/sub/mod.vcl",
  );
  assert.equal(resolveUri("../mod.vcl", "file:///a/b/"), "file:///a/mod.vcl");
});

test("resolveUri keeps absolute POSIX targets on the directory's scheme", () => {
  assert.equal(
    resolveUri("/etc/vcl/mod.vcl", "file:///a/b/"),
    "file:///etc/vcl/mod.vcl",
  );
});

test("resolveUri keeps Windows drive paths on the directory's scheme", () => {
  // In a remote window the include is on the remote machine, not the local one.
  assert.equal(
    resolveUri(
      "C:\\vcl\\mod.vcl",
      "vscode-remote://ssh-remote%2Bwin/c%3A/proj/",
    ),
    "vscode-remote://ssh-remote%2Bwin/C:/vcl/mod.vcl",
  );
});

test("resolveUri never climbs above a Windows drive root", () => {
  // VS Code encodes the drive colon (`c%3A`), which the URL parser does not
  // recognise as a drive.
  assert.equal(
    resolveUri("../../../x.vcl", "file:///c%3A/proj/vcl/"),
    "file:///c:/x.vcl",
  );
  assert.equal(
    resolveUri("../../x.vcl", "vscode-remote://wsl%2Bubuntu/c%3A/proj/"),
    "vscode-remote://wsl%2Bubuntu/c:/x.vcl",
  );
});

test("resolveUri keeps the drive for root-relative targets on Windows", () => {
  assert.equal(
    resolveUri("/etc/x.vcl", "file:///c%3A/proj/"),
    "file:///c:/etc/x.vcl",
  );
  assert.equal(
    resolveUri("\\etc\\x.vcl", "file:///c%3A/proj/"),
    "file:///c:/etc/x.vcl",
  );
});

test("resolveUri resolves . and .. segments", () => {
  assert.equal(
    resolveUri("./a/../b/./x.vcl", "file:///p/"),
    "file:///p/b/x.vcl",
  );
  assert.equal(resolveUri("../../../x.vcl", "file:///p/"), "file:///x.vcl");
});

test("resolveUri turns Windows drive paths into file URIs", () => {
  assert.equal(
    resolveUri("C:\\vcl\\mod.vcl", "file:///c%3A/other/"),
    "file:///C:/vcl/mod.vcl",
  );
  assert.equal(resolveUri("C:/vcl/mod.vcl", null), "file:///C:/vcl/mod.vcl");
});

test("resolveUri treats include names as file names, not URL syntax", () => {
  // falco resolves `include "x"` as a literal path: %, #, ? and : are just
  // characters in the file name, never escapes, fragments, queries or schemes.
  assert.equal(resolveUri("50%41.vcl", "file:///a/"), "file:///a/50%2541.vcl");
  assert.equal(resolveUri("a#b.vcl", "file:///a/"), "file:///a/a%23b.vcl");
  assert.equal(resolveUri("a?b.vcl", "file:///a/"), "file:///a/a%3Fb.vcl");
  assert.equal(resolveUri("x:y.vcl", "file:///a/"), "file:///a/x%3Ay.vcl");
  assert.equal(
    resolveUri("http://host/x.vcl", "file:///a/"),
    "file:///a/http%3A/host/x.vcl",
  );
  assert.equal(
    resolveUri("/etc/50%41.vcl", "file:///a/"),
    "file:///etc/50%2541.vcl",
  );
  assert.equal(
    resolveUri("C:\\v cl\\a#b.vcl", null),
    "file:///C:/v%20cl/a%23b.vcl",
  );
});

test("resolveUri results match the decoded file name in uriKey", () => {
  assert.equal(
    uriKey(resolveUri("50%41.vcl", "file:///a/") ?? ""),
    uriKey("file:///a/50%2541.vcl"),
  );
  assert.notEqual(
    uriKey(resolveUri("50%41.vcl", "file:///a/") ?? ""),
    uriKey("file:///a/50A.vcl"),
  );
});

test("resolveUri is null for relative targets without a directory", () => {
  assert.equal(resolveUri("mod.vcl", null), null);
});

test("resolveUri escapes spaces and plus signs in include names", () => {
  assert.equal(
    resolveUri("a+b (1).vcl", "file:///a/"),
    "file:///a/a%2Bb%20(1).vcl",
  );
});

test("isAbsolutePath recognises POSIX and Windows drive paths", () => {
  assert.equal(isAbsolutePath("/etc/x.vcl"), true);
  assert.equal(isAbsolutePath("C:\\x.vcl"), true);
  assert.equal(isAbsolutePath("c:/x.vcl"), true);
  assert.equal(isAbsolutePath("\\x.vcl"), true);
  assert.equal(isAbsolutePath("x.vcl"), false);
  assert.equal(isAbsolutePath("sub/x.vcl"), false);
});

test("uriKey matches differently encoded URIs for the same file", () => {
  assert.equal(
    uriKey("file:///a/a%2Bb%20(1).vcl"),
    uriKey("file:///a/a+b%20(1).vcl"),
  );
  assert.equal(
    uriKey("file:///c%3A/vcl/x.vcl"),
    uriKey("file:///C:/vcl/x.vcl"),
  );
});

test("uriKey is case-insensitive only for Windows drive paths", () => {
  assert.equal(uriKey("file:///C:/VCL/X.vcl"), uriKey("file:///c:/vcl/x.vcl"));
  assert.equal(
    uriKey("vscode-remote://ssh-remote%2Bwin/c%3A/VCL/X.vcl"),
    uriKey("vscode-remote://ssh-remote%2Bwin/C:/vcl/x.vcl"),
  );
  assert.notEqual(uriKey("file:///a/X.vcl"), uriKey("file:///a/x.vcl"));
});

test("uriKey keeps different files and schemes apart", () => {
  assert.notEqual(uriKey("file:///a/x.vcl"), uriKey("file:///a/y.vcl"));
  assert.notEqual(
    uriKey("file:///a/x.vcl"),
    uriKey("vscode-vfs://github/a/x.vcl"),
  );
});

test("uriKey returns malformed URIs unchanged", () => {
  assert.equal(uriKey("file:///a/%E0%A4%A.vcl"), "file:///a/%E0%A4%A.vcl");
});
