import jar, { yazlStream, zipperStream, type ZipEntryGenerator } from "keycloakify/bin/tools/jar";
import { fromBuffer, Entry, ZipFile } from "yauzl";
import { it, describe, assert, afterAll } from "vitest";
import { Readable } from "stream";
import { tmpdir } from "os";
import { mkdtemp, cp, mkdir, rm, writeFile } from "fs/promises";
import path from "path";
import { createReadStream } from "fs";
import walk from "keycloakify/bin/tools/walk";

type AsyncIterable<T> = {
    [Symbol.asyncIterator](): AsyncIterableIterator<T>;
};

async function arrayFromAsync<T>(asyncIterable: AsyncIterable<T>) {
    const chunks: T[] = [];
    for await (const chunk of asyncIterable) chunks.push(chunk);
    return chunks;
}

async function readToBuffer(stream: NodeJS.ReadableStream) {
    return Buffer.concat(await arrayFromAsync(stream as AsyncIterable<Buffer>));
}

function unzipBuffer(buffer: Buffer) {
    return new Promise<ZipFile>((resolve, reject) =>
        fromBuffer(buffer, { lazyEntries: true }, (err, zipFile) => {
            if (err !== null) {
                reject(err);
            } else {
                resolve(zipFile);
            }
        })
    );
}

function readEntry(zipFile: ZipFile, entry: Entry): Promise<Readable> {
    return new Promise<Readable>((resolve, reject) => {
        zipFile.openReadStream(entry, (err, stream) => {
            if (err !== null) {
                reject(err);
            } else {
                resolve(stream);
            }
        });
    });
}

function readAll(zipFile: ZipFile): Promise<Map<string, Buffer>> {
    return new Promise<Map<string, Buffer>>((resolve, reject) => {
        const entries1: Map<string, Buffer> = new Map();
        zipFile.on("entry", async (entry: Entry) => {
            const stream = await readEntry(zipFile, entry);
            const buffer = await readToBuffer(stream);
            entries1.set(entry.fileName, buffer);
            zipFile.readEntry();
        });
        zipFile.on("end", () => resolve(entries1));
        zipFile.on("error", e => reject(e));
        zipFile.readEntry();
    });
}

describe("yazlStream", () => {
    const coords = { artifactId: "someArtifactId", groupId: "someGroupId", version: "1.2.3" };

    it("creates jar artifacts without error", async () => {
        async function* mockFiles(): ZipEntryGenerator {
            yield { zipPath: "foo", data: Buffer.from("foo") };
        }

        const zipped = await yazlStream({ ...coords, asyncPathGeneratorFn: mockFiles });
        const buffered = await readToBuffer(zipped);
        const unzipped = await unzipBuffer(buffered);
        const entries = await readAll(unzipped);

        validateSimpleJarEntries(entries);
    });
});

describe("zipperStream", () => {
    const coords = { artifactId: "someArtifactId", groupId: "someGroupId", version: "1.2.3" };

    it(
        "creates jar artifacts without error",
        async () => {
            async function* mockFiles(): ZipEntryGenerator {
                yield { zipPath: "foo", data: Buffer.from("foo") };
            }

            const zipped = await zipperStream({ ...coords, asyncPathGeneratorFn: mockFiles });
            const buffered = await readToBuffer(zipped);
            const unzipped = await unzipBuffer(buffered);
            const entries = await readAll(unzipped);

            validateSimpleJarEntries(entries);
        },
        10 * 60 * 1000
    );
});

describe("jar", () => {
    const coords = { artifactId: "someArtifactId", groupId: "someGroupId", version: "1.2.3" };

    const tmpDirs: string[] = [];

    afterAll(async () => {
        await Promise.all(tmpDirs.map(dir => rm(dir, { force: true, recursive: true })));
    });

    it("creates a jar from _real_ files without error", async () => {
        const tmp = await mkdtemp(path.join(tmpdir(), "kc-jar-test-"));

        tmpDirs.push(tmp);

        const rootPath = path.join(tmp, "root");
        const resourcesPath = path.join(tmp, "root", "src", "main", "resources");
        const targetPath = path.join(tmp, "jar.jar");

        await mkdir(resourcesPath, { recursive: true });
        await writeFile(path.join(rootPath, "pom.xml"), "foo", "utf-8");

        await cp(path.dirname(__dirname), resourcesPath, { recursive: true });

        await jar({ ...coords, rootPath, targetPath });

        const buffered = await readToBuffer(createReadStream(targetPath));
        const unzipped = await unzipBuffer(buffered);
        const entries = await readAll(unzipped);
        const zipPaths = Array.from(entries.keys());

        assert.isOk(entries.has("META-INF/MANIFEST.MF"));
        assert.isOk(entries.has("META-INF/maven/someGroupId/someArtifactId/pom.properties"));
        assert.isOk(entries.has("META-INF/maven/someGroupId/someArtifactId/pom.xml"));

        for await (const fsPath of walk(resourcesPath)) {
            if (!fsPath.endsWith(path.sep)) {
                const rel = path.relative(resourcesPath, fsPath).replace(path.sep === "/" ? /\//g : /\\/g, "/");
                assert.isOk(zipPaths.includes(rel), `missing '${rel}' (${rel}, '${zipPaths.join("', '")}')`);
            }
        }
    });
});

function validateSimpleJarEntries(entries: Map<string, Buffer>) {
    assert.equal(entries.size, 3);
    assert.isOk(entries.has("foo"));
    assert.isOk(entries.has("META-INF/MANIFEST.MF"));
    assert.isOk(entries.has("META-INF/maven/someGroupId/someArtifactId/pom.properties"));

    assert.equal("foo", entries.get("foo")?.toString("utf-8"));

    const manifest = entries.get("META-INF/MANIFEST.MF")?.toString("utf-8");
    const pomProperties = entries.get("META-INF/maven/someGroupId/someArtifactId/pom.properties")?.toString("utf-8");

    assert.isOk(manifest?.includes("Created-By: Keycloakify"));
    assert.isOk(pomProperties?.includes("1.2.3"));
    assert.isOk(pomProperties?.includes("someGroupId"));
    assert.isOk(pomProperties?.includes("someArtifactId"));
}
