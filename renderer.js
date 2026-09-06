(function () {
  'use strict';
  const M=LivingWorld,PI=Math.PI,TAU=PI*2;
  const mix=(a,b,t)=>a.map((v,i)=>v+(b[i]-v)*t);
  const PALETTE={ocean:[24,79,98],grass:[117,146,105],forest:[53,103,83],jungle:[42,99,76],desert:[187,159,106],mountain:[154,148,127],snow:[212,224,206],beach:[186,187,137]};
  const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
  class PlanetRenderer {
    constructor(canvas,state,onSelect){
      this.canvas=canvas;this.ctx=canvas.getContext('2d',{alpha:false});this.state=state;this.onSelect=onSelect;
      this.mode='globe';this.region=0;this.selected=null;this.lon=-.22;this.lat=.16;this.zoom=1;this.regionZoom=1;this.center={x:22,y:17};this.clouds=true;this.pointer=null;this.hits=[];this.dirty=true;this.lastLight=-1;this.fraction=0;
      this.surface=document.createElement('canvas');this.surfaceCtx=this.surface.getContext('2d');
      this.createTexture();
      this.resizeObserver=new ResizeObserver(()=>this.resize());this.resizeObserver.observe(canvas);this.resize();this.bind();
    }
    setState(state){this.state=state;this.createTexture();this.dirty=true;this.selected=null;}
    createTexture(){
      const tw=960,th=480;this.tw=tw;this.th=th;this.texture=new Uint8ClampedArray(tw*th*4);this.cloudMap=new Float32Array(tw*th);
      for(let y=0;y<th;y++)for(let x=0;x<tw;x++){
        const lon=(x+.5)/tw*TAU-PI,lat=PI/2-(y+.5)/th*PI,t=M.terrain(lon,lat,this.state.seed);
        let color=PALETTE[t.biome];
        if(!t.land){const shore=clamp((t.elevation+.14)/.20,0,1);color=mix([19,58,78],[60,139,143],shore*.85);if(Math.abs(lat)>1.32)color=mix(color,[200,221,215],clamp((Math.abs(lat)-1.32)/.18,0,1));}
        else{
          if(t.biome==='grass')color=mix(color,[160,166,105],(1-t.moisture)*.55);
          if(t.biome==='mountain')color=mix(color,[218,214,187],clamp(t.ridge*.8,0,1));
          // High frequency slope shading makes mountain ranges readable, not flat spots.
          const relief=(M.noise(lon*95+22,lat*105+61,this.state.seed+31)-.5)*(t.biome==='mountain'?65:20);
          color=color.map(v=>v+relief+(t.detail-.5)*19);
          const river=M.noise(lon*15+110,lat*21+85,this.state.seed+31);
          if(t.elevation>.14&&t.elevation<.65&&t.moisture>.5&&Math.abs(river-.51)<.013)color=mix(color,[68,135,147],.75);
        }
        const pos=(y*tw+x)*4;this.texture[pos]=color[0];this.texture[pos+1]=color[1];this.texture[pos+2]=color[2];this.texture[pos+3]=255;
        const n=M.noise(lon*12+52,lat*17+42,this.state.seed+500)*.58+M.noise(lon*35+75,lat*43+29,this.state.seed+501)*.29+M.noise(lon*81,lat*72,this.state.seed+502)*.13;
        this.cloudMap[y*tw+x]=clamp((n-.58)*3.8,0,.66);
      }
    }
    resize(){
      const r=this.canvas.getBoundingClientRect();this.w=r.width;this.h=r.height;this.dpr=Math.min(window.devicePixelRatio||1,2);
      this.canvas.width=Math.round(this.w*this.dpr);this.canvas.height=Math.round(this.h*this.dpr);this.dirty=true;
    }
    project(lon,lat){
      const d=lon-this.lon,cos=Math.cos(lat),z=Math.sin(lat)*Math.sin(this.lat)+cos*Math.cos(this.lat)*Math.cos(d);
      return {x:this.cx+this.radius*cos*Math.sin(d),y:this.cy-this.radius*(Math.sin(lat)*Math.cos(this.lat)-cos*Math.cos(d)*Math.sin(this.lat)),z};
    }
    paintSphere(){
      const size=Math.min(this.pointer?.moved?420:850,Math.ceil(this.radius*2*this.dpr));this.surface.width=size;this.surface.height=size;
      const im=this.surfaceCtx.createImageData(size,size),data=im.data,cos=Math.cos(this.lat),sin=Math.sin(this.lat),t=this.state.time;
      const sun=((t/M.HOUR)%24-12)/12*PI;
      for(let y=0;y<size;y++)for(let x=0;x<size;x++){
        const nx=(x+.5-size/2)/(size/2),ny=-(y+.5-size/2)/(size/2),rr=nx*nx+ny*ny;if(rr>1)continue;
        const z=Math.sqrt(1-rr),lat=Math.asin(ny*cos+z*sin),lon=this.lon+Math.atan2(nx,z*cos-ny*sin);
        const tx=((Math.floor((lon+PI)/TAU*this.tw)%this.tw)+this.tw)%this.tw,ty=clamp(Math.floor((PI/2-lat)/PI*this.th),0,this.th-1),ti=ty*this.tw+tx,i=(y*size+x)*4;
        const illumination=clamp(nx*-.32+ny*.45+z*.85,.1,1),night=Math.max(0,-Math.cos(lon+sun)*Math.cos(lat));
        const shade=(.47+illumination*.56)*(1-night*.20);
        const cloud=this.clouds?this.cloudMap[ti]:0;
        const edge=Math.pow(1-z,4)*.26;
        for(let k=0;k<3;k++){
          const base=this.texture[ti*4+k]*shade*(1-cloud*.12);
          const cloudColor=[214,226,215][k]*shade;
          data[i+k]=(base*(1-cloud)+cloudColor*cloud)*(1-edge)+[100,171,177][k]*edge;
        }
        data[i+3]=clamp((1-Math.sqrt(rr))*size,0,1)*255;
      }
      this.surfaceCtx.putImageData(im,0,0);this.dirty=false;this.lastLight=Math.floor(this.state.time/900);
    }
    draw(){if(!this.w)return;const x=this.ctx;x.setTransform(this.dpr,0,0,this.dpr,0,0);x.clearRect(0,0,this.w,this.h);this.hits=[];
      if(this.mode==='globe')this.globe(x);else this.local(x);
    }
    globe(x){
      const w=this.w,h=this.h;this.cx=w*.54;this.cy=h*.53;this.radius=Math.min(w*.385,h*.408)*this.zoom;
      const bg=x.createRadialGradient(w*.53,h*.5,30,w*.53,h*.5,w*.75);bg.addColorStop(0,'#20383e');bg.addColorStop(.7,'#142731');bg.addColorStop(1,'#101c29');x.fillStyle=bg;x.fillRect(0,0,w,h);
      for(let i=0;i<160;i++){const sx=M.hash(i,0,2)*w,sy=M.hash(i,1,3)*h,alpha=.10+M.hash(i,3,4)*.38;x.fillStyle=`rgba(205,223,216,${alpha})`;x.fillRect(sx,sy,i%29===0?1.5:.7,i%29===0?1.5:.7);}
      // Fine cartographic orbit lines sit behind the globe.
      x.strokeStyle='#7b9b9630';x.lineWidth=.6;x.beginPath();x.ellipse(this.cx,this.cy,this.radius*1.24,this.radius*.54,-.38,0,TAU);x.stroke();
      x.strokeStyle='#74969117';x.beginPath();x.arc(this.cx,this.cy,this.radius*1.11,0,TAU);x.stroke();
      for(let i=0;i<72;i++){const a=i/72*TAU,r=this.radius*1.11;x.strokeStyle=i%6===0?'#789e955f':'#789e9535';x.beginPath();x.moveTo(this.cx+Math.cos(a)*r,this.cy+Math.sin(a)*r);x.lineTo(this.cx+Math.cos(a)*(r+(i%6===0?5:2)),this.cy+Math.sin(a)*(r+(i%6===0?5:2)));x.stroke();}
      const halo=x.createRadialGradient(this.cx,this.cy,this.radius*.96,this.cx,this.cy,this.radius*1.09);halo.addColorStop(0,'#7ebfbe00');halo.addColorStop(.4,'#87c0b728');halo.addColorStop(1,'#8fbfbc00');x.fillStyle=halo;x.beginPath();x.arc(this.cx,this.cy,this.radius*1.09,0,TAU);x.fill();
      if(this.dirty||this.lastLight!==Math.floor(this.state.time/900))this.paintSphere();
      x.drawImage(this.surface,this.cx-this.radius,this.cy-this.radius,this.radius*2,this.radius*2);
      x.strokeStyle='rgba(193,223,201,.075)';x.lineWidth=.6;
      for(let lat=-PI/3;lat<=PI/3;lat+=PI/6){x.beginPath();let started=false;for(let lon=-PI;lon<=PI+.04;lon+=.04){const p=this.project(lon,lat);if(p.z>.015){if(!started)x.moveTo(p.x,p.y);else x.lineTo(p.x,p.y);started=true;}else started=false;}x.stroke();}
      for(let lon=-PI;lon<PI;lon+=PI/6){x.beginPath();let started=false;for(let lat=-PI/2;lat<=PI/2;lat+=.04){const p=this.project(lon,lat);if(p.z>.015){if(!started)x.moveTo(p.x,p.y);else x.lineTo(p.x,p.y);started=true;}else started=false;}x.stroke();}
      // Only active, time-consuming caravans are shown as trade routes.
      for(const m of this.state.missions){const route=this.state.routes.find(r=>r.from===m.from&&r.to===m.to);if(!route)continue;x.strokeStyle='#e4c686a0';x.setLineDash([3,4]);x.beginPath();let started=false;for(const p of route.path){const q=this.project(p.lon,p.lat);if(q.z>0){if(started)x.lineTo(q.x,q.y);else x.moveTo(q.x,q.y);started=true;}}x.stroke();x.setLineDash([]);
        const progress=clamp((this.state.time-m.started)/(m.arrival-m.started),0,1),point=route.path[Math.floor(progress*(route.path.length-1))],q=this.project(point.lon,point.lat);if(q.z>0){x.fillStyle='#eee3ba';x.fillRect(q.x-2,q.y-2,4,4);}}
      const labels=[];
      for(const r of this.state.regions){const p=this.project(r.site.lon,r.site.lat);if(p.z<.05)continue;const t=this.state.tribes[r.id],selected=r.id===this.region;
        x.strokeStyle=t.color+'55';x.lineWidth=1;x.beginPath();x.arc(p.x,p.y,selected?13:9,0,TAU);x.stroke();x.fillStyle=t.color;x.beginPath();x.arc(p.x,p.y,selected?4:3,0,TAU);x.fill();
        x.fillStyle='#f9edd0';x.beginPath();x.arc(p.x,p.y,1.4,0,TAU);x.fill();
        const lx=p.x+19,ly=p.y-16;x.strokeStyle=t.color+'90';x.beginPath();x.moveTo(p.x+5,p.y-3);x.lineTo(lx-3,ly+2);x.lineTo(lx+12,ly+2);x.stroke();
        x.font='12px Georgia';const width=x.measureText(t.name).width+18;let y=ly-16;
        for(const l of labels)if(Math.abs(l.y-y)<28)y=l.y+30;labels.push({y});
        x.fillStyle=selected?'rgba(25,42,43,.92)':'rgba(21,39,43,.72)';x.fillRect(lx,y,width,27);x.strokeStyle=selected?t.color+'66':'#8ba39128';x.strokeRect(lx,y,width,27);x.fillStyle=selected?'#f0e3be':'#d7ddc8';x.fillText(t.name,lx+8,y+17);
        this.hits.push({type:'region',id:r.id,x:lx,y,width,height:27});this.hits.push({type:'region',id:r.id,x:p.x-14,y:p.y-14,width:28,height:28});
      }
      x.font='8px system-ui';x.fillStyle='#799891';x.textAlign='center';x.fillText('С',this.cx,this.cy-this.radius*1.11-11);x.fillText('Ю',this.cx,this.cy+this.radius*1.11+16);x.textAlign='left';
    }
    local(x){
      const w=this.w,h=this.h,r=this.state.regions[this.region],t=this.state.tribes[this.region];
      this.tile=Math.min(w/37,h/30)*this.regionZoom;this.ox=w/2-this.center.x*this.tile;this.oy=h/2-this.center.y*this.tile;
      const size=this.tile,ox=this.ox,oy=this.oy;const point=p=>({x:ox+p.x*size,y:oy+p.y*size});
      x.fillStyle='#173b43';x.fillRect(0,0,w,h);
      for(let gy=0;gy<M.HEIGHT;gy++)for(let gx=0;gx<M.WIDTH;gx++){
        const px=ox+gx*size,py=oy+gy*size;if(px+size<0||py+size<0||px>w||py>h)continue;
        const tile=r.tiles[gy*M.WIDTH+gx],v=M.hash(gx,gy,this.state.seed),colors={grass:['#738d55','#778e57','#7c935a'],forest:['#627e4f','#658050','#688453'],rock:['#858975','#7e8673','#8d8f79'],sand:['#b5b083','#b2a77d','#bab187'],water:['#437c88','#487f88','#418394']};
        x.fillStyle=colors[tile.type][Math.floor(v*3)];x.fillRect(px,py,size+1,size+1);
        if(tile.type==='water'){x.strokeStyle='#83b5b455';x.lineWidth=1;x.beginPath();const phase=(this.state.elapsed/6+gx*5)%size;x.moveTo(px+phase,py+size*.3);x.lineTo(px+phase+size*.35,py+size*.3);x.stroke();}
        else{for(let i=0;i<7;i++){x.fillStyle=i%2?'#bec58a35':'#345c3533';const bx=px+M.hash(gx+i,gy,24)*size,by=py+M.hash(gx,gy+i,21)*size;x.fillRect(bx,by,Math.max(1,size*.09),1);if(i%3===0)x.fillRect(bx+1,by-2,1,2);}
          if(tile.type==='rock'&&v>.55){const peak=size*(1+v),cx=px+size*.5;x.fillStyle='#53685955';x.beginPath();x.moveTo(cx-size,py+size*.7);x.lineTo(cx+size*.8,py+size);x.lineTo(cx+size*1.3,py+size*.6);x.closePath();x.fill();x.fillStyle='#8f9580';x.beginPath();x.moveTo(cx-size*.9,py+size*.7);x.lineTo(cx,py-peak);x.lineTo(cx+size,py+size*.7);x.closePath();x.fill();x.fillStyle='#63766c';x.beginPath();x.moveTo(cx,py-peak);x.lineTo(cx+size,py+size*.7);x.lineTo(cx+size*.16,py+size*.5);x.closePath();x.fill();x.fillStyle='#d0d3b2';x.beginPath();x.moveTo(cx,py-peak);x.lineTo(cx-size*.23,py-peak*.48);x.lineTo(cx+size*.12,py-peak*.62);x.lineTo(cx+size*.26,py-peak*.42);x.closePath();x.fill();}}
      }
      // Footpaths connect actual occupied homes, fields, and the river crossing.
      x.strokeStyle='#a7a376';x.lineWidth=size*.48;x.lineCap='round';for(const dest of [...r.buildings,...r.fields,{x:27.5,y:17.5}]){const a=point(r.center),b=point(dest);x.beginPath();x.moveTo(a.x,a.y);x.lineTo(b.x,a.y);x.lineTo(b.x,b.y);x.stroke();}x.lineCap='butt';
      for(const f of r.fields){const p=point(f);x.fillStyle='#66684b';x.fillRect(p.x-size,p.y-size,size*3,size*2);for(let row=0;row<5;row++)for(let col=0;col<9;col++){const px=p.x-size+col*size*.32,py=p.y-size+row*size*.37;x.fillStyle=f.progress>.8?'#d6b967':'#92ae68';x.fillRect(px,py,size*.13,Math.max(1,size*.2*f.progress));}}
      const objects=[];for(const n of r.resources)objects.push({type:n.kind,y:n.y,obj:n});for(const b of r.buildings)objects.push({type:'building',y:b.y,obj:b});for(const z of r.animals){const pos=M.visualPosition(z,this.fraction*.7,r);objects.push({type:'animal',y:pos.y,obj:z,pos});}for(const a of M.residents(this.state,r.id)){const pos=M.visualPosition(a,this.fraction,r);objects.push({type:'person',y:pos.y,obj:a,pos});}objects.sort((a,b)=>a.y-b.y);
      for(const object of objects){const a=object.obj,p=point(object.pos||a),unit=size/18;if(p.x<-30||p.y<-35||p.x>w+30||p.y>h+35)continue;
        x.save();x.translate(p.x,p.y);x.scale(unit,unit);
        if(object.type==='tree'){
          if(a.amount<1){x.fillStyle='#685b3e';x.fillRect(-2,-2,5,3);}
          else{const growth=.65+a.amount/a.capacity*.4;x.scale(growth,growth);x.fillStyle='#244d3244';x.beginPath();x.ellipse(4,4,10,4,0,0,TAU);x.fill();x.fillStyle='#746345';x.fillRect(-2,-5,4,12);
            if(M.hash(Math.floor(a.x),Math.floor(a.y),71)>.5){x.fillStyle='#315c3f';x.beginPath();x.ellipse(0,-10,11,12,0,0,TAU);x.fill();x.fillStyle='#547b45';x.beginPath();x.ellipse(-3,-16,8,8,0,0,TAU);x.fill();x.fillStyle='#749558';x.beginPath();x.ellipse(-5,-20,4,3,0,0,TAU);x.fill();}
            else{x.fillStyle='#244f40';x.beginPath();x.moveTo(0,-28);x.lineTo(-11,-8);x.lineTo(11,-8);x.closePath();x.fill();x.fillStyle='#345e44';x.beginPath();x.moveTo(0,-22);x.lineTo(-13,0);x.lineTo(13,0);x.closePath();x.fill();x.fillStyle='#507954';x.beginPath();x.moveTo(-1,-24);x.lineTo(-9,-9);x.lineTo(0,-11);x.closePath();x.fill();}}
        }else if(object.type==='berry'){x.fillStyle='#3c653f';x.beginPath();x.ellipse(0,0,5,3,0,0,TAU);x.fill();if(a.amount>=1){x.fillStyle='#c89177';x.fillRect(-3,-2,2,2);x.fillRect(1,-3,2,2);}}
        else if(object.type==='stone'){if(a.amount>0){x.fillStyle='#676e66';x.beginPath();x.moveTo(-6,1);x.lineTo(-3,-6);x.lineTo(4,-7);x.lineTo(8,2);x.closePath();x.fill();x.fillStyle='#afb09b';x.beginPath();x.moveTo(-3,-6);x.lineTo(4,-7);x.lineTo(1,-2);x.lineTo(-6,1);x.closePath();x.fill();}}
        else if(object.type==='building')this.building(x,a);
        else if(object.type==='animal'){x.fillStyle=a.kind==='fox'?'#b37d51':a.kind==='deer'?'#b89f72':'#d9d1ad';x.fillRect(-4,-2,7,4);x.fillRect(3,-4,3,4);if(a.kind==='rabbit'){x.fillRect(3,-7,1,4);x.fillRect(5,-6,1,3);}else{x.fillStyle='#6c684a';x.fillRect(-3,2,1,3);x.fillRect(2,2,1,3);}}
        else if(object.type==='person'){
          const kid=M.ageOf(this.state,a)<16;if(kid)x.scale(.75,.75);const moving=a.path.length>0,phase=Math.sin((this.state.elapsed+this.fraction)*8+a.id)*1.2;
          x.fillStyle='#263e3444';x.beginPath();x.ellipse(0,3,5,2,0,0,TAU);x.fill();x.fillStyle='#2c3f36';x.fillRect(-3,1,2,4+(moving?phase:0));x.fillRect(1,1,2,4-(moving?phase:0));x.fillStyle=t.color;x.fillRect(-3,-5,6,7);x.fillStyle='#e0bd8b';x.fillRect(-2,-10,5,5);x.fillStyle=a.id%3===0?'#c6ad72':'#635038';x.fillRect(-3,-11,6,2);if(a.carrying){x.fillStyle='#9a7752';x.fillRect(3,-4,4,5);}if(a.action==='sleep'){x.fillStyle='#e0e6c5';x.font='6px sans-serif';x.fillText('z',5,-10);}if(this.selected===a.id){x.strokeStyle='#fff0bb';x.lineWidth=.9;x.beginPath();x.ellipse(0,5,7,3,0,0,TAU);x.stroke();x.fillStyle='#fff0bb';x.beginPath();x.moveTo(-2,-17);x.lineTo(2,-17);x.lineTo(0,-14);x.closePath();x.fill();}
          this.hits.push({type:'person',id:a.id,x:p.x-8,y:p.y-13,width:16,height:20});
        }
        x.restore();
      }
      const camp=point(r.center);x.fillStyle='#dfac69';x.beginPath();x.arc(camp.x,camp.y,size*.15,0,TAU);x.fill();
      const hour=M.localHour(this.state,r.id),night=hour<6||hour>20;
      if(night){x.fillStyle='rgba(12,25,51,.48)';x.fillRect(0,0,w,h);for(const b of r.buildings.filter(b=>b.progress>=1)){const p=point(b),glow=x.createRadialGradient(p.x,p.y,1,p.x,p.y,size*1.5);glow.addColorStop(0,'#ffcc6855');glow.addColorStop(1,'#ffb95300');x.fillStyle=glow;x.fillRect(p.x-size*1.5,p.y-size*1.5,size*3,size*3);}}
      if(this.clouds&&r.weather==='rain'){x.strokeStyle='#bed4d555';x.lineWidth=.7;for(let i=0;i<160;i++){const px=(M.hash(i,1,123)*w+this.state.elapsed*.2)%w,py=(M.hash(i,2,123)*h+this.state.elapsed*2)%h;x.beginPath();x.moveTo(px,py);x.lineTo(px-3,py+9);x.stroke();}}
      const vignette=x.createRadialGradient(w*.5,h*.5,h*.25,w*.5,h*.5,w*.75);vignette.addColorStop(0,'#0d222300');vignette.addColorStop(1,'#0d2223b0');x.fillStyle=vignette;x.fillRect(0,0,w,h);
      // A subtle perimeter anchors the close view as a chart inside the atlas.
      x.fillStyle='rgba(13,31,37,.85)';x.fillRect(0,0,w,56);x.fillRect(0,h-42,w,42);
      x.fillStyle='#d8d9b9';x.font='11px Georgia';x.textAlign='center';x.fillText(t.name+' · окрестности',w/2,h-22);x.textAlign='left';
      x.strokeStyle='#b2c5ad';x.lineWidth=1;x.beginPath();x.moveTo(w-132,h-67);x.lineTo(w-132+size*5,h-67);x.stroke();x.fillStyle='#c6d0b7';x.font='8px system-ui';x.fillText('100 м',w-132,h-73);
    }
    building(x,b){
      const s=b.type==='stone',p=b.progress;
      x.fillStyle='#23382c44';x.fillRect(-11,2,26,12);x.fillStyle='#706449';x.fillRect(-11,-1,22,12);
      if(p<1){x.strokeStyle='#cab787';x.lineWidth=2;x.strokeRect(-10,-5,20,15);x.beginPath();x.moveTo(-10,-5);x.lineTo(0,-15);x.lineTo(10,-5);x.stroke();x.fillStyle='#b3bc94';x.fillRect(-13,14,26,2);x.fillStyle='#ebcf87';x.fillRect(-13,14,26*p,2);return;}
      x.fillStyle=s?'#b7b3a0':'#c1ac79';x.fillRect(-10,-6,20,16);x.fillStyle=s?'#929789':'#a09062';x.fillRect(5,-6,5,16);x.fillStyle='#695e46';x.beginPath();x.moveTo(-13,-5);x.lineTo(-1,-18);x.lineTo(14,-5);x.closePath();x.fill();x.fillStyle=s?'#96a494':'#ae8255';x.beginPath();x.moveTo(-13,-5);x.lineTo(-1,-18);x.lineTo(2,-5);x.closePath();x.fill();x.fillStyle='#596045';x.fillRect(-2,3,4,7);x.fillStyle='#e4c379';x.fillRect(-7,-1,3,3);x.fillRect(5,-1,3,3);x.fillStyle='#736a53';x.fillRect(6,-17,3,8);
    }
    focus(region=this.region){this.region=region;if(this.mode==='globe'){this.lon=this.state.regions[region].site.lon+.08;this.lat=this.state.regions[region].site.lat*.6;this.zoom=1;}else{this.center={x:22,y:18};this.regionZoom=1;}this.dirty=true;}
    setMode(mode){this.mode=mode;this.dirty=true;}
    zoomBy(factor){if(this.mode==='globe')this.zoom=clamp(this.zoom*factor,.72,1.55);else this.regionZoom=clamp(this.regionZoom*factor,.65,3);this.dirty=true;}
    bind(){
      const c=this.canvas;
      c.addEventListener('pointerdown',e=>{const rect=c.getBoundingClientRect();this.pointer={id:e.pointerId,x:e.clientX,y:e.clientY,lastX:e.clientX,lastY:e.clientY,moved:false,rect};c.setPointerCapture(e.pointerId);});
      c.addEventListener('pointermove',e=>{if(!this.pointer)return;const p=this.pointer,dx=e.clientX-p.lastX,dy=e.clientY-p.lastY;p.lastX=e.clientX;p.lastY=e.clientY;p.moved=p.moved||Math.hypot(e.clientX-p.x,e.clientY-p.y)>4;
        if(p.moved){if(this.mode==='globe'){this.lon-=dx*.006/this.zoom;this.lat=clamp(this.lat+dy*.005/this.zoom,-1.2,1.2);}else{this.center.x=clamp(this.center.x-dx/this.tile,4,M.WIDTH-4);this.center.y=clamp(this.center.y-dy/this.tile,3,M.HEIGHT-3);}this.dirty=true;}});
      c.addEventListener('pointerup',e=>{const p=this.pointer;if(!p)return;if(!p.moved){const px=e.clientX-p.rect.left,py=e.clientY-p.rect.top,hit=[...this.hits].reverse().find(q=>px>=q.x&&py>=q.y&&px<=q.x+q.width&&py<=q.y+q.height);if(hit)this.onSelect(hit);}this.pointer=null;this.dirty=true;c.releasePointerCapture(e.pointerId);});
      c.addEventListener('pointercancel',()=>{this.pointer=null;});c.addEventListener('lostpointercapture',()=>{this.pointer=null;});
      c.addEventListener('wheel',e=>{e.preventDefault();this.zoomBy(e.deltaY<0?1.08:1/1.08);},{passive:false});
      c.addEventListener('keydown',e=>{if(['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','+','-','='].includes(e.key)){e.preventDefault();if(e.key==='+'||e.key==='=')this.zoomBy(1.1);else if(e.key==='-')this.zoomBy(1/1.1);else{const dx=e.key==='ArrowLeft'?-1:e.key==='ArrowRight'?1:0,dy=e.key==='ArrowUp'?-1:e.key==='ArrowDown'?1:0;if(this.mode==='globe'){this.lon+=dx*.12;this.lat=clamp(this.lat-dy*.1,-1.2,1.2);}else{this.center.x=clamp(this.center.x+dx*2,4,M.WIDTH-4);this.center.y=clamp(this.center.y+dy*2,3,M.HEIGHT-3);}this.dirty=true;}}});
    }
  }
  window.PlanetRenderer=PlanetRenderer;
})();
