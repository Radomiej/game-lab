export function parseAssertionOutput(lines) {
  const assertionResults=[],output=[];
  for(const line of lines) {
    const match=line.match(/^__JAVA_LAB_CHECK__([\w-]+)\t(PASS|FAIL)\t([^\r\n]*)$/);
    if(!match){output.push(line);continue;}
    assertionResults.push({id:match[1],passed:match[2]==='PASS',detail:match[2]==='PASS'?'Asercja Java zaliczona.':match[3]});
  }
  return {assertionResults,output:output.join('\n')};
}
