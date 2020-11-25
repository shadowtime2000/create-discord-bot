#!/usr/bin/env node
// @ts-check

const { execSync } = require("child_process");
const fs = require("fs-extra");
const path = require("path");
const prompts = require("prompts");
const validateName = require("validate-npm-package-name");

/**
 * @typedef {() => void} StepAction
 */

/**
 * @typedef {Object} Package
 * @property {string} name
 * @property {string} version
 * @property {string} description
 * @property {Record<string, string> | undefined | null} scripts
 * @property {Record<string, string> | undefined | null} dependencies
 * @property {Record<string, string> | undefined | null} devDependencies
 */

/**
 * @typedef {Object & { ignoreDry?: boolean; }} Step
 * @property {string} message
 * @property {StepAction} action
 */

/**
 * @function
 * @param {string} token
 * @returns {string | null} applicationId
 */
const getApplicationId = (token) => {
  try {
    /**
     * @type {string}
     */
    const response = execSync(
      `curl -s -X GET -H "Authorization: Bot ${token}" "https://discordapp.com/api/oauth2/applications/@me"`
    ).toString();
    const parsedResponse = JSON.parse(response);

    return parsedResponse.id || null;
  } catch {
    return null;
  }
};
/**
 * @type {string}
 */
const appDir = path.join(__dirname, "../app");
/**
 * @type {Package}
 */
const appPackage = require(path.join(appDir, "package.json"));
const { name, version } = require(path.join(__dirname, "../package.json"));
const utilityNameAndVersion = `${name} v${version}`;

console.log(`This utility will walk you through creating a ${name} application.

Press ENTER to use the default.
Press ^C at any time to quit.

${utilityNameAndVersion}`);

prompts([
  {
    type: "text",
    name: "name",
    initial: appPackage.name,
    validate: (name) => {
      const { validForNewPackages, errors, warnings } = validateName(name);
      return (
        validForNewPackages || `Error: ${(errors || warnings).join(", ")}.`
      );
    },
    message: "Application name?",
  },
])
  .then(async ({ name }) => {
    /**
     * @type {string}
     */
    const dir = path.resolve(name);
    /**
     * @type {boolean}
     */
    const isUpdate = fs.existsSync(dir);
    /**
     * @type {Step[]}
     */
    let steps;

    if (isUpdate) {
      const { update } = await prompts([
        {
          type: "confirm",
          name: "update",
          message: `Directory '${dir}' already exists. Do you want to update it?`,
        },
      ]);

      if (!update) {
        console.log();
        throw "Quitting...";
      }

      steps = [
        {
          message: `Updating core files in '${name}'...`,
          action: () => {
            fs.copySync(`${appDir}/src/core`, `${dir}/src/core`);
            fs.copySync(`${appDir}/src/index.js`, `${dir}/src/index.js`);
          },
        },
      ];
    } else {
      const { token } = await prompts([
        {
          type: "password",
          name: "token",
          initial: "DISCORD_BOT_TOKEN_PLACEHOLDER",
          message: "Discord bot token?",
        },
      ]);

      steps = [
        {
          message: `Creating directory '${name}'...`,
          action: () => fs.mkdirSync(dir),
        },
        {
          message: "Creating boilerplate...",
          action: () => {
            fs.copySync(appDir, dir);
            fs.writeFileSync(
              path.join(dir, ".gitignore"),
              "node_modules/\ntoken.json\n"
            );
          },
        },
        {
          message: "Updating package.json...",
          action: () => {
            const description = `Generated by ${utilityNameAndVersion}.`;
            const newPackage = { ...appPackage, name, description };
            fs.writeFileSync(
              path.join(dir, "package.json"),
              `${JSON.stringify(newPackage, null, 2)}\n`
            );
          },
        },
        {
          message: "Writing token.json...",
          action: () =>
            fs.writeFileSync(
              path.join(dir, "token.json"),
              `${JSON.stringify({ token }, null, 2)}\n`
            ),
        },
        {
          message: "Installing modules...",
          action: () => {
            process.chdir(dir);
            execSync("npm ci");
          },
        },
        {
          message: "\nGenerating bot invite link...",
          ignoreDry: true,
          action: () => {
            const applicationId = getApplicationId(token);
            console.log(
              applicationId
                ? `Invite your bot: https://discordapp.com/oauth2/authorize?scope=bot&client_id=${applicationId}`
                : "The given bot token was invalid so no link was generated."
            );
          },
        },
      ];
    }

    const [, , ...args] = process.argv;
    const isDryRun = args[0] === "--dry-run";

    console.log();
    steps.forEach(({ message, ignoreDry, action }) => {
      console.log(message);
      if (ignoreDry || !isDryRun) {
        action();
      }
    });

    console.log();
    console.log(`Done!\n\nStart by running:\n\t$ cd ${name}/\n\t$ npm start`);
    process.exit(0);
  })
  .catch(console.error);
