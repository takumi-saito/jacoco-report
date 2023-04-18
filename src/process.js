/**
 * レポートからファイルのカバレッジを取得
 * @param {Array} reports - レポートの配列
 * @param {Array} files - ファイルの配列
 * @returns {object} ファイルのカバレッジ情報
 */
function getFileCoverage(reports, files) {
  const packages = reports.flatMap((report) => report["package"]);
  return getFileCoverageFromPackages(packages, files);
}

/**
 * パッケージからファイルのカバレッジを取得
 * @param {Array} packages - パッケージの配列
 * @param {Array} files - ファイルの配列
 * @returns {object} ファイルのカバレッジ情報
 */
function getFileCoverageFromPackages(packages, files) {
  const resultFiles = packages.flatMap((item) => {
    const packageName = item["$"].name;
    const sourceFiles = item.sourcefile;
    return sourceFiles.flatMap((sourceFile) => {
      const sourceFileName = sourceFile["$"].name;
      const file = files.find((f) =>
          f.filePath.endsWith(`${packageName}/${sourceFileName}`)
      );
      if (file) {
        const counters = sourceFile["counter"];
        if (counters) {
          const coverage = getDetailedCoverage(counters, "INSTRUCTION");
          return {
            ...file,
            name: sourceFileName,
            missed: coverage.missed,
            covered: coverage.covered,
            percentage: coverage.percentage,
          };
        }
      }
      return [];
    });
  }).sort((a, b) => b.percentage - a.percentage);

  return {
    files: resultFiles,
    percentage: resultFiles.length ? getTotalPercentage(resultFiles) : 100,
  };
}

/**
 * ファイルの総カバレッジを取得
 * @param {Array} files - ファイルの配列
 * @returns {number} 総カバレッジ
 */
function getTotalPercentage(files) {
  const { covered, missed } = files.reduce(
      (acc, file) => {
        acc.missed += file.missed;
        acc.covered += file.covered;
        return acc;
      },
      { missed: 0, covered: 0 }
  );

  return parseFloat(((covered / (covered + missed)) * 100).toFixed(2));
}

/**
 * レポートから全体のカバレッジを取得
 * @param {Array} reports - レポートの配列
 * @returns {object} 全体のカバレッジ情報
 */
function getOverallCoverage(reports) {
  const modules = reports.map((report) => {
    const moduleName = report["$"].name;
    const moduleCoverage = getModuleCoverage(report);
    return {
      module: moduleName,
      coverage: moduleCoverage,
    };
  });

  return {
    project: getProjectCoverage(reports),
    modules: modules,
  };
}

/**
 * レポートからモジュールのカバレッジを取得
 * @param {object} report - レポートオブジェクト
 * @returns {number} モジュールのカバレッジ
 */
function getModuleCoverage(report) {
  const counters = report["counter"];
  const coverage = getDetailedCoverage(counters, "INSTRUCTION");
  return coverage.percentage;
}

/**
 * レポートからプロジェクト全体のカバレッジを取得
 * @param {Array} reports - レポートの配列
 * @returns {number} プロジェクト全体のカバレッジ
 */
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

/**
 * カウンタータイプに応じた詳細なカバレッジ情報を取得
 * @param {Array} counters - カウンターの配列
 * @param {string} type - カウンタータイプ
 * @returns {object} 詳細なカバレッジ情報
 */
function getDetailedCoverage(counters, type) {
  const counter = counters.find((c) => c["$"].type === type);
  const missed = parseFloat(counter["$"].missed);
  const covered = parseFloat(counter["$"].covered);
  return {
    missed: missed,
    covered: covered,
    percentage: parseFloat(((covered / (covered + missed)) * 100).toFixed(2)),
  };
}

module.exports = {
  getFileCoverage,
  getOverallCoverage,
};