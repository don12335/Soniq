import { describe, expect, it } from "vitest";
import { parseVisitorData } from "./visitorData";

const cgsVisitor = "CgsABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789%3D%3D";
const cgtVisitor = "CgtABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789%3D%3D";

function responseWithVisitor(visitor: string): string {
  const fields = Array<unknown>(14).fill(null);
  fields[13] = visitor;
  return ")]}'\n\n" + JSON.stringify([["yt.sw.adr", null, [[fields]]]]);
}

describe("parseVisitorData", () => {
  it("reads visitorData starting with Cgs, which the old Cgt-only regex missed", () => {
    expect(parseVisitorData(responseWithVisitor(cgsVisitor))).toBe(cgsVisitor);
  });

  it("keeps the url-encoded padding instead of truncating at %3D", () => {
    const value = parseVisitorData(responseWithVisitor(cgtVisitor));
    expect(value).toBe(cgtVisitor);
    expect(value?.endsWith("%3D%3D")).toBe(true);
  });

  it("falls back to a pattern search when the json shape changes", () => {
    expect(parseVisitorData(`garbage "${cgsVisitor}" more`)).toBe(cgsVisitor);
    expect(parseVisitorData("no token here")).toBeNull();
  });
});
