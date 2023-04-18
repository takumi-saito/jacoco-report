const core = require("@actions/core");
const github = require("@actions/github");
const fs = require("fs");
const parser = require("xml2js");
const { parseBooleans } = require("xml2js/lib/processors");
const process = require("./process");
const render = require("./render");

/**
 * Github Actions の処理を実行。
 * イベントに基づいてカバレッジ情報を取得し、PRへコメントを追加する。
 */
async function action() {
  try {
    const input = getInputValues();
    const { base, head, prNumber } = getContextInfo(github.context);

    const client = github.getOctokit(input.token);
    const reportsJson = await getJsonReports(input.paths);
    const reports = reportsJson.map((report) => report["report"]);

    const overallCoverage = process.getOverallCoverage(reports);
    core.setOutput("coverage-overall", overallCoverage.project.toFixed(2));

    const changedFiles = await getChangedFiles(base, head, client);
    const filesCoverage = process.getFileCoverage(reports, changedFiles);
    core.setOutput("coverage-changed-files", filesCoverage.percentage.toFixed(2));

    if (prNumber) {
      await handlePullRequest(prNumber, input, overallCoverage, filesCoverage, client);
    }
  } catch (error) {
    core.setFailed(error);
  }
}

function getInputValues() {
  return {
    paths: core.getInput("paths").split(","),
    minCoverageOverall: parseFloat(core.getInput("min-coverage-overall")),
    minCoverageChangedFiles: parseFloat(core.getInput("min-coverage-changed-files")),
    title: core.getInput("title"),
    updateComment: parseBooleans(core.getInput("update-comment")),
    debugMode: parseBooleans(core.getInput("debug-mode")),
    token: core.getInput("token"),
  };
}

function getContextInfo(context) {
  const event = context.eventName;
  core.info(`Event is ${event}`);

  let base, head, prNumber;
  switch (event) {
    case "pull_request":
    case "pull_request_target":
      base = context.payload.pull_request.base.sha;
      head = context.payload.pull_request.head.sha;
      prNumber = context.payload.pull_request.number;
      break;
    case "push":
      base = context.payload.before;
      head = context.payload.after;
      break;
    default:
      throw `Only pull requests and pushes are supported, ${event} not supported.`;
  }

  core.info(`base sha: ${base}`);
  core.info(`head sha: ${head}`);

  return { base, head, prNumber };
}

/**
 * 指定されたレポートファイルから JSON オブジェクトを取得
 *
 * @param {Array} xmlPaths - レポートファイルへのパスの配列
 * @returns {Promise<Array>} - JSON オブジェクトの配列
 */
async function getJsonReports(xmlPaths) {
  return Promise.all(
      xmlPaths.map(async (xmlPath) => {
        const reportXml = await fs.promises.readFile(xmlPath.trim(), "utf-8");
        return await parser.parseStringPromise(reportXml);
      })
  );
}

/**
 * 指定された範囲の変更ファイルを取得
 *
 * @param {string} base - 比較元のコミット SHA
 * @param {string} head - 比較先のコミット SHA
 * @param {Object} client - Github API クライアント
 * @returns {Promise<Array>} - 変更ファイルの配列
 */
async function getChangedFiles(base, head, client) {
  const response = await client.repos.compareCommits({
    base,
    head,
    owner: github.context.repo.owner,
    repo: github.context.repo.repo,
  });

  return response.data.files.map((file) => ({
    filePath: file.filename,
    url: file.blob_url,
  }));
}

async function handlePullRequest(prNumber, input, overallCoverage, filesCoverage, client) {
  await addComment(prNumber, input.updateComment, render.getTitle(input.title), render.getPRComment(overallCoverage.project, filesCoverage, input.minCoverageOverall, input.minCoverageChangedFiles, input.title), client);

  const failedCoverage = filesCoverage.files.some((file) => file.percentage < input.minCoverageChangedFiles);
  if (failedCoverage) {
    core.setFailed
    ("Target file must have more than minimum coverage.");
  }
}


/**
 * PR にコメントを追加または更新
 *
 * @param {number} prNumber - PR 番号
 * @param {boolean} update - コメントを更新する場合は true
 * @param {string} title - コメントのタイトル
 * @param {string} body - コメントの本文
 * @param {Object} client - Github API クライアント
 */
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
