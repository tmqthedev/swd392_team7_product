import { execFileSync } from 'node:child_process';

const sql = `
SELECT table_name, (xpath('/row/cnt/text()', xml_count))[1]::text::int as row_count 
FROM (
  SELECT table_name, query_to_xml(format('select count(*) as cnt from %I', table_name), false, true, '') as xml_count 
  FROM information_schema.tables 
  WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
) t 
ORDER BY table_name;
`;

const cmd = `docker exec aives-postgres psql -U aives -d aives -t -c "${sql.replace(/\n/g, ' ')}"`;

try {
  const out = execFileSync('node', ['scripts/aws-ssm.js', cmd], { encoding: 'utf8' });
  console.log(out);
} catch (e) {
  console.error(e.message);
}
