import limits from '../backend/ai-input-limits.json' with {type:'json'};
// Preserve all user images/history and the complete proposed program. If the
// transport cannot hold another image, disclose the missing review instead.
export function visualReviewInput(input,result,proposal,capture){
 const images=[...(input.images??[]),...capture.images],all=[...images,...(input.history??[]).flatMap(t=>t.images??[])];
 if(all.length>limits.maxImages||all.reduce((n,i)=>n+(i.dataUrl.length-i.dataUrl.indexOf(',')-1)*.75,0)>limits.maxTotalImageBytes)throw Error('Für die automatische Bildprüfung ist kein Platz neben den vorhandenen Bildern.');
 const visualFeedback={previewId:proposal.previewId,revision:proposal.revision,views:capture.views,scope:capture.scope,proposal:{revision:result.revision,label:result.label,commands:result.commands,checks:result.checks??[]},verification:proposal.verification??null,independentCheck:proposal.independentCheck??null,toolResults:proposal.report??null,...(proposal.photoComparison?{photoComparison:proposal.photoComparison.map(({overlay,...report})=>report)}:{})};
 if(JSON.stringify(visualFeedback).length>256000)throw Error('Der vollständige Entwurf überschreitet das Budget der Bildprüfung.');
 return {images,visualFeedback};
}
