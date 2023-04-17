/******/ (() => { // webpackBootstrap
/******/ 	var __webpack_modules__ = ({

/***/ 736:
/***/ ((module, __unused_webpack_exports, __nccwpck_require__) => {

const core = __nccwpck_require__(637);
const github = __nccwpck_require__(200);
const fs = __nccwpck_require__(147);
const parser = __nccwpck_require__(634);
const { parseBooleans } = __nccwpck_require__(150);
const process = __nccwpck_require__(377);
const render = __nccwpck_require__(543);

async function action() {
  try {
    const pathsString = core.getInput("paths");
    const reportPaths = pathsString.split(",");
    const minCoverageOverall = parseFloat(
      core.getInput("min-coverage-overall")
    );
    const minCoverageChangedFiles = parseFloat(
      core.getInput("min-coverage-changed-files")
    );
    const title = core.getInput("title");
    const updateComment = parseBooleans(core.getInput("update-comment"));
    const debugMode = parseBooleans(core.getInput("debug-mode"));
    const event = github.context.eventName;
    core.info(`Event is ${event}`);

    var base;
    var head;
    var prNumber;
    switch (event) {
      case "pull_request":
      case "pull_request_target":
        base = github.context.payload.pull_request.base.sha;
        head = github.context.payload.pull_request.head.sha;
        prNumber = github.context.payload.pull_request.number;
        break;
      case "push":
        base = github.context.payload.before;
        head = github.context.payload.after;
        isPR = false;
        break;
      default:
        throw `Only pull requests and pushes are supported, ${github.context.eventName} not supported.`;
    }

    core.info(`base sha: ${base}`);
    core.info(`head sha: ${head}`);

    const client = github.getOctokit(core.getInput("token"));

    if (debugMode) core.info(`reportPaths: ${reportPaths}`);
    const reportsJsonAsync = getJsonReports(reportPaths);
    const changedFiles = await getChangedFiles(base, head, client);
    if (debugMode) core.info(`changedFiles: ${debug(changedFiles)}`);

    const reportsJson = await reportsJsonAsync;
    if (debugMode) core.info(`report value: ${debug(reportsJson)}`);
    const reports = reportsJson.map((report) => report["report"]);

    const overallCoverage = process.getOverallCoverage(reports);
    if (debugMode) core.info(`overallCoverage: ${overallCoverage}`);
    core.setOutput(
      "coverage-overall",
      parseFloat(overallCoverage.project.toFixed(2))
    );

    const filesCoverage = process.getFileCoverage(reports, changedFiles);
    if (debugMode) core.info(`filesCoverage: ${debug(filesCoverage)}`);
    core.setOutput(
      "coverage-changed-files",
      parseFloat(filesCoverage.percentage.toFixed(2))
    );

    if (prNumber != null) {
      await addComment(
        prNumber,
        updateComment,
        render.getTitle(title),
        render.getPRComment(
          overallCoverage.project,
          filesCoverage,
          minCoverageOverall,
          minCoverageChangedFiles,
          title
        ),
        client
      );
    }
  } catch (error) {
    core.setFailed(error);
  }
}

function debug(obj) {
  return JSON.stringify(obj, " ", 4);
}

async function getJsonReports(xmlPaths) {
  return Promise.all(
    xmlPaths.map(async (xmlPath) => {
      const reportXml = await fs.promises.readFile(xmlPath.trim(), "utf-8");
      return await parser.parseStringPromise(reportXml);
    })
  );
}

async function getChangedFiles(base, head, client) {
  const response = await client.repos.compareCommits({
    base,
    head,
    owner: github.context.repo.owner,
    repo: github.context.repo.repo,
  });

  var changedFiles = [];
  response.data.files.forEach((file) => {
    var changedFile = {
      filePath: file.filename,
      url: file.blob_url,
    };
    changedFiles.push(changedFile);
  });
  return changedFiles;
}

async function addComment(prNumber, update, title, body, client) {
  let commentUpdated = false;

  if (update && title) {
    const comments = await client.issues.listComments({
      issue_number: prNumber,
      ...github.context.repo,
    });
    const comment = comments.data.find((comment) =>
      comment.body.startsWith(title),
    );

    if (comment) {
      await client.issues.updateComment({
        comment_id: comment.id,
        body: body,
        ...github.context.repo,
      });
      commentUpdated = true;
    }
  }

  if (!commentUpdated) {
    await client.issues.createComment({
      issue_number: prNumber,
      body: body,
      ...github.context.repo,
    });
  }
}

module.exports = {
  action,
};


/***/ }),

/***/ 377:
/***/ ((module) => {

function getFileCoverage(reports, files) {
  const packages = reports.map((report) => report["package"]);
  return getFileCoverageFromPackages([].concat(...packages), files);
}

function getFileCoverageFromPackages(packages, files) {
  const result = {};
  const resultFiles = [];
  packages.forEach((item) => {
    const packageName = item["$"].name;
    const sourceFiles = item.sourcefile;
    sourceFiles.forEach((sourceFile) => {
      const sourceFileName = sourceFile["$"].name;
      var file = files.find(function (f) {
        return f.filePath.endsWith(`${packageName}/${sourceFileName}`);
      });
      if (file != null) {
        const fileName = sourceFile["$"].name;
        const counters = sourceFile["counter"];
        if (counters != null && counters.length != 0) {
          const coverage = getDetailedCoverage(counters, "INSTRUCTION");
          file["name"] = fileName;
          file["missed"] = coverage.missed;
          file["covered"] = coverage.covered;
          file["percentage"] = coverage.percentage;
          resultFiles.push(file);
        }
      }
    });
    resultFiles.sort((a, b) => b.percentage - a.percentage);
  });
  result.files = resultFiles;
  if (resultFiles.length != 0) {
    result.percentage = getTotalPercentage(resultFiles);
  } else {
    result.percentage = 100;
  }
  return result;
}

function getTotalPercentage(files) {
  var missed = 0;
  var covered = 0;
  files.forEach((file) => {
    missed += file.missed;
    covered += file.covered;
  });
  return parseFloat(((covered / (covered + missed)) * 100).toFixed(2));
}

function getOverallCoverage(reports) {
  const coverage = {};
  const modules = [];
  reports.forEach((report) => {
    const moduleName = report["$"].name;
    const moduleCoverage = getModuleCoverage(report);
    modules.push({
      module: moduleName,
      coverage: moduleCoverage,
    });
  });
  coverage.project = getProjectCoverage(reports);
  coverage.modules = modules;
  return coverage;
}

function getModuleCoverage(report) {
  const counters = report["counter"];
  const coverage = getDetailedCoverage(counters, "INSTRUCTION");
  return coverage.percentage;
}

function getProjectCoverage(reports) {
  const coverages = reports.map((report) =>
    getDetailedCoverage(report["counter"], "INSTRUCTION")
  );
  const covered = coverages.reduce(
    (acc, coverage) => acc + coverage.covered,
    0
  );
  const missed = coverages.reduce((acc, coverage) => acc + coverage.missed, 0);
  return parseFloat(((covered / (covered + missed)) * 100).toFixed(2));
}

function getDetailedCoverage(counters, type) {
  const coverage = {};
  counters.forEach((counter) => {
    const attr = counter["$"];
    if (attr["type"] == type) {
      const missed = parseFloat(attr["missed"]);
      const covered = parseFloat(attr["covered"]);
      coverage.missed = missed;
      coverage.covered = covered;
      coverage.percentage = parseFloat(
        ((covered / (covered + missed)) * 100).toFixed(2)
      );
    }
  });
  return coverage;
}

module.exports = {
  getFileCoverage,
  getOverallCoverage,
};


/***/ }),

/***/ 543:
/***/ ((module) => {

function getPRComment(
  overallCoverage,
  filesCoverage,
  minCoverageOverall,
  minCoverageChangedFiles,
  title
) {
  const fileTable = getFileTable(filesCoverage, minCoverageChangedFiles);
  const overallTable = getOverallTable(overallCoverage, minCoverageOverall);
  const heading = getTitle(title);
  return heading + fileTable + `\n\n` + overallTable;
}

function getFileTable(filesCoverage, minCoverage) {
  const files = filesCoverage.files;
  if (files.length === 0) {
    return `> There is no coverage information present for the Files changed`;
  }

  const tableHeader = getHeader(filesCoverage.percentage);
  const tableStructure = `|:-|:-:|:-:|`;
  var table = tableHeader + `\n` + tableStructure;
  files.forEach((file) => {
    renderFileRow(`[${file.name}](${file.url})`, file.percentage);
  });
  return table;

  function renderFileRow(name, coverage) {
    addRow(getRow(name, coverage));
  }

  function getHeader(coverage) {
    var status = getStatus(coverage, minCoverage);
    return `|File|Coverage [${formatCoverage(coverage)}]|${status}|`;
  }

  function getRow(name, coverage) {
    var status = getStatus(coverage, minCoverage);
    return `|${name}|${formatCoverage(coverage)}|${status}|`;
  }

  function addRow(row) {
    table = table + `\n` + row;
  }
}

function getOverallTable(coverage, minCoverage) {
  var status = getStatus(coverage, minCoverage);
  const tableHeader = `|Total Project Coverage|${formatCoverage(
    coverage
  )}|${status}|`;
  const tableStructure = `|:-|:-:|:-:|`;
  return tableHeader + `\n` + tableStructure;
}

function getTitle(title) {
  if (title != null && title.length > 0) {
    return "### " + title + `\n`;
  } else {
    return "";
  }
}

function getStatus(coverage, minCoverage) {
  var status = `:green_apple:`;
  if (coverage < minCoverage) {
    status = `:x:`;
  }
  return status;
}

function formatCoverage(coverage) {
  return `${parseFloat(coverage.toFixed(2))}%`;
}

module.exports = {
  getPRComment,
  getTitle,
};


/***/ }),

/***/ 637:
/***/ ((module) => {

module.exports = eval("require")("@actions/core");


/***/ }),

/***/ 200:
/***/ ((module) => {

module.exports = eval("require")("@actions/github");


/***/ }),

/***/ 634:
/***/ ((module) => {

module.exports = eval("require")("xml2js");


/***/ }),

/***/ 150:
/***/ ((module) => {

module.exports = eval("require")("xml2js/lib/processors");


/***/ }),

/***/ 147:
/***/ ((module) => {

"use strict";
module.exports = require("fs");

/***/ })

/******/ 	});
/************************************************************************/
/******/ 	// The module cache
/******/ 	var __webpack_module_cache__ = {};
/******/ 	
/******/ 	// The require function
/******/ 	function __nccwpck_require__(moduleId) {
/******/ 		// Check if module is in cache
/******/ 		var cachedModule = __webpack_module_cache__[moduleId];
/******/ 		if (cachedModule !== undefined) {
/******/ 			return cachedModule.exports;
/******/ 		}
/******/ 		// Create a new module (and put it into the cache)
/******/ 		var module = __webpack_module_cache__[moduleId] = {
/******/ 			// no module.id needed
/******/ 			// no module.loaded needed
/******/ 			exports: {}
/******/ 		};
/******/ 	
/******/ 		// Execute the module function
/******/ 		var threw = true;
/******/ 		try {
/******/ 			__webpack_modules__[moduleId](module, module.exports, __nccwpck_require__);
/******/ 			threw = false;
/******/ 		} finally {
/******/ 			if(threw) delete __webpack_module_cache__[moduleId];
/******/ 		}
/******/ 	
/******/ 		// Return the exports of the module
/******/ 		return module.exports;
/******/ 	}
/******/ 	
/************************************************************************/
/******/ 	/* webpack/runtime/compat */
/******/ 	
/******/ 	if (typeof __nccwpck_require__ !== 'undefined') __nccwpck_require__.ab = __dirname + "/";
/******/ 	
/************************************************************************/
var __webpack_exports__ = {};
// This entry need to be wrapped in an IIFE because it need to be isolated against other modules in the chunk.
(() => {
const core = __nccwpck_require__(637);
const action = __nccwpck_require__(736);

action.action().catch(error => {
    core.setFailed(error.message);
});

})();

module.exports = __webpack_exports__;
/******/ })()
;