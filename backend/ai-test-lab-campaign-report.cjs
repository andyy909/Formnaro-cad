const fs = require('node:fs');
const path = require('node:path');

function readLabCampaigns(directory, seriesId) {
 const campaigns = [];
 for (const name of fs.readdirSync(directory)) {
  if (!/^Kampagne-[a-f0-9-]{36}\.json$/.test(name)) continue;
  try {
   const campaign = JSON.parse(fs.readFileSync(path.join(directory, name), 'utf8'));
   if (campaign.format !== 'FormnaroLabCampaign' || campaign.version !== 1 ||
       name !== 'Kampagne-' + campaign.id + '.json' || !Array.isArray(campaign.phases) ||
       !Array.isArray(campaign.series) || (seriesId && !campaign.series.includes(seriesId))) continue;
   campaigns.push(campaign);
  } catch {
   // An unreadable local receipt must not prevent exporting other evidence.
  }
 }
 return campaigns;
}
function campaignReportMarkdown(campaigns) {
 if (!campaigns.length) return '';
 const rows = campaigns.flatMap(campaign => [
  '- ' + campaign.id + ' · ' + campaign.status + ' · ' + campaign.phase,
  ...campaign.phases.map(phase => '  - ' + phase.name + ' · ' + phase.status +
   (phase.plannedTrials === undefined ? '' : ' · ' + (phase.trials ?? 0) + ' von ' + phase.plannedTrials + ' Versuchen')),
 ]);
 return '\n## Kampagnen\n\n' + rows.join('\n') + '\n';
}

module.exports = { readLabCampaigns, campaignReportMarkdown };
