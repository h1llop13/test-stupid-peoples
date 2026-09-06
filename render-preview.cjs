// Optional offline Canvas visual check: no browser or network is involved.
// node tests/render-preview.cjs /absolute/path/to/@napi-rs/canvas /tmp/output-directory
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {createCanvas}=require(process.argv[2]);
const M=require('../simulation.js');
const state=M.create(),canvas=createCanvas(980,640);
canvas.getBoundingClientRect=()=>({width:980,height:640});canvas.addEventListener=()=>{};
const context={LivingWorld:M,document:{createElement:()=>createCanvas(1,1)},window:{devicePixelRatio:1},ResizeObserver:class{observe(){}},console};
vm.createContext(context);vm.runInContext(fs.readFileSync(path.join(__dirname,'../renderer.js'),'utf8'),context);
const renderer=new context.window.PlanetRenderer(canvas,state,()=>{});
fs.mkdirSync(process.argv[3],{recursive:true});
renderer.draw();fs.writeFileSync(path.join(process.argv[3],'planet.png'),canvas.toBuffer('image/png'));
renderer.setMode('region');renderer.fraction=15;renderer.selected=1;renderer.draw();fs.writeFileSync(path.join(process.argv[3],'region.png'),canvas.toBuffer('image/png'));
console.log('Rendered planet.png and region.png with the actual game renderer.');
