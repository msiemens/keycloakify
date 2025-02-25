import * as fs from "fs";
import { join as pathJoin, dirname as pathDirname } from "path";
import { assert } from "tsafe/assert";
import { Reflect } from "tsafe/Reflect";
import type { BuildOptions } from "../BuildOptions";
import { resources_common, lastKeycloakVersionWithAccountV1, accountV1 } from "../../constants";
import { downloadBuiltinKeycloakTheme } from "../../download-builtin-keycloak-theme";
import { transformCodebase } from "../../tools/transformCodebase";

export type BuildOptionsLike = {
    keycloakifyBuildDirPath: string;
    cacheDirPath: string;
};

{
    const buildOptions = Reflect<BuildOptions>();

    assert<typeof buildOptions extends BuildOptionsLike ? true : false>();
}

export async function bringInAccountV1(params: { buildOptions: BuildOptionsLike }) {
    const { buildOptions } = params;

    const builtinKeycloakThemeTmpDirPath = pathJoin(buildOptions.keycloakifyBuildDirPath, "..", "tmp_yxdE2_builtin_keycloak_theme");

    await downloadBuiltinKeycloakTheme({
        "destDirPath": builtinKeycloakThemeTmpDirPath,
        "keycloakVersion": lastKeycloakVersionWithAccountV1,
        buildOptions
    });

    const accountV1DirPath = pathJoin(buildOptions.keycloakifyBuildDirPath, "src", "main", "resources", "theme", accountV1, "account");

    transformCodebase({
        "srcDirPath": pathJoin(builtinKeycloakThemeTmpDirPath, "base", "account"),
        "destDirPath": accountV1DirPath
    });

    const commonResourceFilePaths = [
        "node_modules/patternfly/dist/css/patternfly.min.css",
        "node_modules/patternfly/dist/css/patternfly-additions.min.css"
    ];

    for (const relativeFilePath of commonResourceFilePaths.map(path => pathJoin(...path.split("/")))) {
        const destFilePath = pathJoin(accountV1DirPath, "resources", resources_common, relativeFilePath);

        fs.mkdirSync(pathDirname(destFilePath), { "recursive": true });

        fs.cpSync(pathJoin(builtinKeycloakThemeTmpDirPath, "keycloak", "common", "resources", relativeFilePath), destFilePath);
    }

    const resourceFilePaths = ["css/account.css"];

    for (const relativeFilePath of resourceFilePaths.map(path => pathJoin(...path.split("/")))) {
        const destFilePath = pathJoin(accountV1DirPath, "resources", relativeFilePath);

        fs.mkdirSync(pathDirname(destFilePath), { "recursive": true });

        fs.cpSync(pathJoin(builtinKeycloakThemeTmpDirPath, "keycloak", "account", "resources", relativeFilePath), destFilePath);
    }

    fs.rmSync(builtinKeycloakThemeTmpDirPath, { "recursive": true });

    fs.writeFileSync(
        pathJoin(accountV1DirPath, "theme.properties"),
        Buffer.from(
            [
                "accountResourceProvider=account-v1",
                "",
                "locales=ar,ca,cs,da,de,en,es,fr,fi,hu,it,ja,lt,nl,no,pl,pt-BR,ru,sk,sv,tr,zh-CN",
                "",
                "styles=" + [...resourceFilePaths, ...commonResourceFilePaths.map(path => `resources_common/${path}`)].join(" "),
                "",
                "##### css classes for form buttons",
                "# main class used for all buttons",
                "kcButtonClass=btn",
                "# classes defining priority of the button - primary or default (there is typically only one priority button for the form)",
                "kcButtonPrimaryClass=btn-primary",
                "kcButtonDefaultClass=btn-default",
                "# classes defining size of the button",
                "kcButtonLargeClass=btn-lg",
                ""
            ].join("\n"),
            "utf8"
        )
    );
}
