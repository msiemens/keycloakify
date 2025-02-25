#!/usr/bin/env node

import { downloadKeycloakStaticResources } from "./keycloakify/generateTheme/downloadKeycloakStaticResources";
import { join as pathJoin, relative as pathRelative } from "path";
import { readBuildOptions } from "./keycloakify/BuildOptions";
import { themeTypes, keycloak_resources, lastKeycloakVersionWithAccountV1 } from "./constants";
import * as fs from "fs";

(async () => {
    const reactAppRootDirPath = process.cwd();

    const buildOptions = readBuildOptions({
        reactAppRootDirPath,
        "processArgv": process.argv.slice(2)
    });

    const reservedDirPath = pathJoin(buildOptions.publicDirPath, keycloak_resources);

    for (const themeType of themeTypes) {
        await downloadKeycloakStaticResources({
            "keycloakVersion": (() => {
                switch (themeType) {
                    case "login":
                        return buildOptions.loginThemeResourcesFromKeycloakVersion;
                    case "account":
                        return lastKeycloakVersionWithAccountV1;
                }
            })(),
            themeType,
            "themeDirPath": reservedDirPath,
            "usedResources": undefined,
            buildOptions
        });
    }

    fs.writeFileSync(
        pathJoin(reservedDirPath, "README.txt"),
        Buffer.from(
            // prettier-ignore
            [
                "This is just a test folder that helps develop",
                "the login and register page without having to run a Keycloak container"
            ].join(" ")
        )
    );

    fs.writeFileSync(pathJoin(buildOptions.publicDirPath, "keycloak-resources", ".gitignore"), Buffer.from("*", "utf8"));

    console.log(`${pathRelative(reactAppRootDirPath, reservedDirPath)} directory created.`);
})();
