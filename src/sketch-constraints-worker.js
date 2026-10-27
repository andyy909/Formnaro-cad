import {solveSketchConstraints} from './sketch-constraints-solver.js';
self.onmessage=event=>{
 const {ticket,sketch,affected}=event.data;
 const result=solveSketchConstraints(sketch,{affected});
 self.postMessage({ticket,result});
};
