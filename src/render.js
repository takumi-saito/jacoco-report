/**
 * PRコメントを生成
 * @param {number} overallCoverage - 全体のカバレッジ
 * @param {object} filesCoverage - 変更されたファイルのカバレッジ
 * @param {number} minCoverageOverall - 全体の最低カバレッジ
 * @param {number} minCoverageChangedFiles - 変更されたファイルの最低カバレッジ
 * @param {string} title - コメントのタイトル
 * @returns {string} PRコメント
 */
function getPRComment(overallCoverage, filesCoverage, minCoverageOverall, minCoverageChangedFiles, title) {
  const fileTable = getFileTable(filesCoverage, minCoverageChangedFiles);
  const overallTable = getOverallTable(overallCoverage, minCoverageOverall);
  const heading = getTitle(title);
  return `${heading}${fileTable}\n\n${overallTable}`;
}

/**
 * ファイルのカバレッジテーブルを生成
 * @param {object} filesCoverage - ファイルのカバレッジ
 * @param {number} minCoverage - 最低カバレッジ
 * @returns {string} ファイルのカバレッジテーブル
 */
function getFileTable(filesCoverage, minCoverage) {
  const files = filesCoverage.files;

  if (files.length === 0) {
    return '> There is no coverage information present for the Files changed';
  }

  const tableHeader = getHeader(filesCoverage.percentage);
  const tableStructure = '|:-|:-:|:-:|';
  let table = `${tableHeader}\n${tableStructure}`;

  files.forEach(file => {
    table += `\n${getRow(`[${file.name}](${file.url})`, file.percentage)}`;
  });

  return table;

  function getHeader(coverage) {
    const status = getStatus(coverage, minCoverage);
    return `|File|Coverage [${formatCoverage(coverage)}]|${status}|`;
  }

  function getRow(name, coverage) {
    const status = getStatus(coverage, minCoverage);
    return `|${name}|${formatCoverage(coverage)}|${status}|`;
  }
}

/**
 * 全体のカバレッジテーブルを生成
 * @param {number} coverage - 全体のカバレッジ
 * @param {number} minCoverage - 最低カバレッジ
 * @returns {string} 全体のカバレッジテーブル
 */
function getOverallTable(coverage, minCoverage) {
  const status = getStatus(coverage, minCoverage);
  const tableHeader = `|Total Project Coverage|${formatCoverage(coverage)}|${status}|`;
  const tableStructure = '|:-|:-:|:-:|';
  return `${tableHeader}\n${tableStructure}`;
}

/**
 * タイトルを生成します。
 * @param {string} title - タイトル
 * @returns {string} タイトルのMarkdown形式
 */
function getTitle(title) {
  return title ? `### ${title}\n` : '';
}

/**
 * カバレッジのステータスを取得
 * @param {number} coverage - カバレッジ
 * @param {number} minCoverage - 最低カバレッジ
 * @returns {string} カバレッジのステータス（絵文字）
 */
function getStatus(coverage, minCoverage) {
  return coverage < minCoverage ? ':x:' : ':white_check_mark:';
}

/**
 * カバレッジをフォーマット
 * @param {number} coverage - カバレッジ
 * @returns {string} フォーマットされたカバレッジ（パーセント表示）
 */
function formatCoverage(coverage) {
  return `${parseFloat(coverage.toFixed(2))}%`;
}

module.exports = {
  getPRComment,
  getTitle,
};