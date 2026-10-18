/* QronoX – Kinetrix Distance Time Mapper — simulation, 3D road view and distance–time graph */
(() => {
 const $ = id => document.getElementById(id);
 const canvas = $('graph'), ctx = canvas.getContext('2d');
 const state = {t:0, x:0, v:0, a:0, running:false, throttle:false, braking:false, points:[{t:0,x:0,v:0}], last:0, marks:[], ended:false, cruise:false, ghost:null, sel:-1};
 const ACCEL = 2.4, BRAKE = 5.0, MAX_SPEED = 22; // m/s; deliberate classroom-scale model
 const COAST0 = 0.15, COAST1 = 0.03; // pedals released: rolling resistance + air drag slow the car (m/s², and per m/s)
 let dpr=1;

 /* ================= 3D ROAD VIEW (visual layer only — reads state, never changes physics) ================= */
 function createView3D(host){
  if(!window.THREE) return null;
  const T=THREE;
  let renderer;
  try{renderer=new T.WebGLRenderer({antialias:true,powerPreference:'high-performance'});}catch(e){return null}
  if(!renderer.getContext()) return null;
  const lin=h=>new T.Color(h).convertSRGBToLinear();
  const hash=n=>{const s=Math.sin(n*127.1+311.7)*43758.5453;return s-Math.floor(s)};
  renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,1.75));
  renderer.outputEncoding=T.sRGBEncoding;
  renderer.toneMapping=T.ACESFilmicToneMapping;renderer.toneMappingExposure=1.0;
  renderer.shadowMap.enabled=true;renderer.shadowMap.type=T.PCFSoftShadowMap;
  renderer.domElement.className='gl';
  host.prepend(renderer.domElement);
  const ANISO=renderer.capabilities.getMaxAnisotropy();
  const scene=new T.Scene();
  const camera=new T.PerspectiveCamera(52,1,0.1,3000);
  const HORIZON='#cfdde3';
  scene.fog=new T.Fog(new T.Color(HORIZON),80,900);

  // ---------- helpers ----------
  function tex(w,h,draw,{repeat=false,srgb=true}={}){
   const c=document.createElement('canvas');c.width=w;c.height=h;const g=c.getContext('2d');draw(g,w,h);
   const t=new T.CanvasTexture(c);if(srgb)t.encoding=T.sRGBEncoding;t.anisotropy=ANISO;
   if(repeat){t.wrapS=t.wrapT=T.RepeatWrapping}return t;
  }
  function speckle(g,w,h,amt,sparks){
   const img=g.getImageData(0,0,w,h),d=img.data;
   for(let i=0;i<d.length;i+=4){const n=(Math.random()-.5)*amt;d[i]+=n;d[i+1]+=n;d[i+2]+=n;
    if(sparks&&Math.random()<sparks){const s=Math.random()<.5?35:-30;d[i]+=s;d[i+1]+=s;d[i+2]+=s}}
   g.putImageData(img,0,0);
  }
  // Smooth normals except across sharp creases (keeps the body panels glossy, edges crisp)
  function creased(g,angle){
   g=g.index?g.toNonIndexed():g;const p=g.attributes.position,n=p.count,fn=new Array(n),groups=new Map();
   const a=new T.Vector3(),b=new T.Vector3(),c=new T.Vector3(),ab=new T.Vector3(),ac=new T.Vector3();
   const key=i=>`${p.getX(i).toFixed(4)},${p.getY(i).toFixed(4)},${p.getZ(i).toFixed(4)}`;
   for(let i=0;i<n;i+=3){a.fromBufferAttribute(p,i);b.fromBufferAttribute(p,i+1);c.fromBufferAttribute(p,i+2);
    const f=ab.subVectors(b,a).clone().cross(ac.subVectors(c,a)).normalize();
    for(let j=0;j<3;j++){fn[i+j]=f;const k=key(i+j);let arr=groups.get(k);if(!arr){arr=[];groups.set(k,arr)}arr.push(i+j)}}
   const out=new Float32Array(n*3),cosA=Math.cos(angle),acc=new T.Vector3();
   for(let i=0;i<n;i++){acc.set(0,0,0);const f=fn[i];for(const j of groups.get(key(i)))if(fn[j].dot(f)>=cosA)acc.add(fn[j]);
    if(acc.lengthSq()===0)acc.copy(f);acc.normalize();out[i*3]=acc.x;out[i*3+1]=acc.y;out[i*3+2]=acc.z}
   g.setAttribute('normal',new T.BufferAttribute(out,3));return g;
  }
  // Tileable value noise (period in cells) for procedural textures
  const h2=(i,j,sd)=>{let n=Math.imul(i,374761393)+Math.imul(j,668265263)+Math.imul(sd,1442695041);n=Math.imul(n^(n>>>13),1274126177);n^=n>>>16;return (n>>>0)/4294967296};
  function vnoise(x,y,px,py,sd){const xi=Math.floor(x),yi=Math.floor(y);let xf=x-xi,yf=y-yi;xf=xf*xf*(3-2*xf);yf=yf*yf*(3-2*yf);
   const x0=((xi%px)+px)%px,x1=(x0+1)%px,y0=((yi%py)+py)%py,y1=(y0+1)%py;
   const a=h2(x0,y0,sd),b=h2(x1,y0,sd),c=h2(x0,y1,sd),d=h2(x1,y1,sd);
   return a+(b-a)*xf+(c-a)*yf+(a-b-c+d)*xf*yf}
  const glowTex=tex(64,64,(g)=>{const r=g.createRadialGradient(32,32,0,32,32,32);r.addColorStop(0,'rgba(255,255,255,1)');r.addColorStop(.25,'rgba(255,255,255,.55)');r.addColorStop(1,'rgba(255,255,255,0)');g.fillStyle=r;g.fillRect(0,0,64,64)},{srgb:false});

  // ---------- sky dome (raw output so its horizon matches the fog colour exactly) ----------
  const SUN_DIR=new T.Vector3(-0.5,0.62,-0.6).normalize();
  const skyMat=new T.ShaderMaterial({side:T.BackSide,depthWrite:false,fog:false,
   uniforms:{zenith:{value:new T.Color('#4a86bd')},horizon:{value:new T.Color(HORIZON)},ground:{value:new T.Color('#b9c6bf')},sunDir:{value:SUN_DIR}},
   vertexShader:'varying vec3 vDir;void main(){vDir=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',
   fragmentShader:`uniform vec3 zenith,horizon,ground,sunDir;varying vec3 vDir;
    float hs(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
    float ns(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.0-2.0*f);return mix(mix(hs(i),hs(i+vec2(1.,0.)),f.x),mix(hs(i+vec2(0.,1.)),hs(i+vec2(1.,1.)),f.x),f.y);}
    float fbm(vec2 p){float v=0.,a=.5;for(int i=0;i<5;i++){v+=a*ns(p);p*=2.03;a*=.5;}return v;}
    void main(){vec3 d=normalize(vDir);float h=d.y;
     vec3 c=mix(horizon,zenith,pow(clamp(h,0.,1.),.55));
     c=mix(c,ground,smoothstep(0.,-.06,h));
     float s=max(dot(d,sunDir),0.);c+=vec3(1.,.86,.62)*(pow(s,10.)*.18+pow(s,900.)*2.5);
     if(h>0.){vec2 uv=d.xz/(h+.15)*1.4;float n=fbm(uv*1.2+vec2(3.1,7.7));float cl=smoothstep(.55,.82,n)*smoothstep(.02,.3,h);c=mix(c,vec3(.97,.98,1.),cl*.8);}
     gl_FragColor=vec4(c,1.);}`});
  const sky=new T.Mesh(new T.SphereGeometry(1500,40,20),skyMat);sky.renderOrder=-1;scene.add(sky);

  // Environment map for car-paint and glass reflections
  {const pm=new T.PMREMGenerator(renderer);const es=new T.Scene();
   const eg=new T.SphereGeometry(50,32,16),ep=eg.attributes.position,ec=[],zc=new T.Color('#4a86bd'),hc=new T.Color(HORIZON),tc=new T.Color();
   for(let i=0;i<ep.count;i++){const y=ep.getY(i)/50;tc.copy(hc).lerp(zc,Math.pow(Math.max(y,0),.55));ec.push(tc.r,tc.g,tc.b)}
   eg.setAttribute('color',new T.Float32BufferAttribute(ec,3));
   es.add(new T.Mesh(eg,new T.MeshBasicMaterial({vertexColors:true,side:T.BackSide})));
   const gnd=new T.Mesh(new T.CircleGeometry(48,32),new T.MeshBasicMaterial({color:lin('#57574f')}));gnd.rotation.x=-Math.PI/2;gnd.position.y=-1.2;es.add(gnd);
   scene.environment=pm.fromScene(es,0.02).texture;pm.dispose();}

  // ---------- lights ----------
  scene.add(new T.HemisphereLight(lin('#d6e8f5'),lin('#5a6744'),0.7));
  const sun=new T.DirectionalLight(lin('#fff1dc'),2.3);sun.castShadow=true;
  sun.shadow.mapSize.set(2048,2048);Object.assign(sun.shadow.camera,{left:-32,right:32,top:32,bottom:-32,near:1,far:200});
  sun.shadow.bias=-0.0004;sun.shadow.normalBias=0.03;scene.add(sun,sun.target);

  // ---------- ground, road, shoulders ----------
  const ROAD_W=7.2,PERIOD=12,ASPH_W=7.6; // texture covers 7.6 m (incl. ragged edges) × 12 m of road
  const PXM=100,AW=ASPH_W*PXM,AH=PERIOD*PXM;
  const asphalt=tex(AW,AH,(g,w,h)=>{
   const img=g.createImageData(w,h),d=img.data;
   const tracks=[2.0-.8,2.0+.8,5.6-.8,5.6+.8]; // wheel tracks in each lane (m from left canvas edge)
   for(let y=0;y<h;y++){const ym=y/PXM;
    const edgeL=.06+.16*vnoise(3,ym*2.5,999,PERIOD*2.5,7),edgeR=ASPH_W-.06-.16*vnoise(9,ym*2.5,999,PERIOD*2.5,8);
    for(let x=0;x<w;x++){const xm=x/PXM,i=(y*w+x)*4;
     const n1=vnoise(x/120,y/120,999,h/120,1),n2=vnoise(x/30,y/30,999,h/30,2),n3=vnoise(x/6,y/6,999,h/6,3);
     let L=70+(n1-.5)*18+(n2-.5)*10+(n3-.5)*16+(Math.random()-.5)*26;
     const r=Math.random();if(r<.014)L+=26+Math.random()*30;else if(r<.026)L-=22;  // aggregate stones / pits
     let tw=0;for(const t of tracks){const dd=(xm-t)/.28;tw+=Math.exp(-dd*dd)}L*=1-.13*Math.min(1,tw);
     let R_=L,G=L,B=L*1.035;
     // painted markings: solid edge lines and a 4 m dash in the centre (worn, ragged)
     const inEdge=(xm>.4&&xm<.55)||(xm>ASPH_W-.55&&xm<ASPH_W-.4),inDash=xm>ASPH_W/2-.06&&xm<ASPH_W/2+.06&&ym<4;
     if(inEdge||inDash){let cov=.93-(n3<.32?.55:0)-(Math.random()*.22)-(n2>.72?.25:0);cov=Math.max(0,Math.min(1,cov));
      R_+=(230-R_)*cov;G+=(228-G)*cov;B+=(218-B)*cov}
     d[i]=R_;d[i+1]=G;d[i+2]=B;
     d[i+3]=(xm<edgeL||xm>edgeR)?0:255;                                   // crumbly road edge
    }}
   g.putImageData(img,0,0);
   const rnd=(a,b)=>a+Math.random()*(b-a),both=(fn)=>{fn(0);fn(-h);fn(h)};
   // repair patches with darker, fresher bitumen and sealed seams
   for(let k=0;k<2;k++){const px=rnd(.6,ASPH_W-2)*PXM,py=rnd(0,h),pw=rnd(.6,1.4)*PXM,ph=rnd(.5,1.6)*PXM;
    both(o=>{g.fillStyle='rgba(30,32,35,.13)';g.fillRect(px,py+o,pw,ph);g.strokeStyle='rgba(20,20,22,.22)';g.lineWidth=2;g.strokeRect(px,py+o,pw,ph)})}
   // cracks (meandering, some sealed with tar)
   for(let k=0;k<18;k++){let x=rnd(.5,ASPH_W-.5)*PXM,y=rnd(0,h),a=rnd(0,Math.PI*2);const pts=[[x,y]];
    for(let j=0;j<rnd(5,16);j++){a+=rnd(-1,1);x+=Math.cos(a)*rnd(2,5);y+=Math.sin(a)*rnd(2,5);pts.push([x,y])}
    const tar=Math.random()<.15;
    both(o=>{g.beginPath();g.moveTo(pts[0][0],pts[0][1]+o);for(const q of pts)g.lineTo(q[0],q[1]+o);
     g.strokeStyle=tar?'rgba(14,14,15,.4)':'rgba(22,22,24,.45)';g.lineWidth=tar?2.5:.9;g.stroke()})}
   // oil drips down the middle of each lane
   for(const lc of [2.0,5.6])for(let k=0;k<7;k++){const cx=(lc+rnd(-.35,.35))*PXM,cy=rnd(0,h),rr=rnd(6,22);
    both(o=>{const gr=g.createRadialGradient(cx,cy+o,0,cx,cy+o,rr);gr.addColorStop(0,'rgba(8,8,10,.30)');gr.addColorStop(1,'rgba(8,8,10,0)');g.fillStyle=gr;g.fillRect(cx-rr,cy+o-rr,rr*2,rr*2)})}
  },{repeat:true});
  asphalt.repeat.set(1,720/PERIOD);
  // roughness: smoother where tyres polish the lanes, a little smoother on paint
  const asphRough=tex(190,300,(g,w,h)=>{g.fillStyle='rgb(232,232,232)';g.fillRect(0,0,w,h);
   for(const t of [1.2,2.8,4.8,6.4]){const x=t/ASPH_W*w,gr=g.createLinearGradient(x-9,0,x+9,0);gr.addColorStop(0,'rgba(170,170,170,0)');gr.addColorStop(.5,'rgba(170,170,170,1)');gr.addColorStop(1,'rgba(170,170,170,0)');g.fillStyle=gr;g.fillRect(x-9,0,18,h)}
   speckle(g,w,h,30,0)},{repeat:true,srgb:false});
  asphRough.repeat.copy(asphalt.repeat);
  const road=new T.Mesh(new T.PlaneGeometry(ASPH_W,720),new T.MeshStandardMaterial({map:asphalt,roughnessMap:asphRough,bumpMap:asphalt,bumpScale:.018,roughness:1,metalness:0,alphaTest:.5}));
  road.rotation.x=-Math.PI/2;road.position.y=.05;road.receiveShadow=true;scene.add(road);

  const gravel=tex(256,256,(g,w,h)=>{g.fillStyle='#8c816c';g.fillRect(0,0,w,h);speckle(g,w,h,40,.05);
   for(let i=0;i<900;i++){const x=Math.random()*w,y=Math.random()*h,r=1+Math.random()*3.2,l=95+Math.random()*90,t=Math.random()*30-10;
    g.fillStyle=`rgba(20,16,10,.35)`;g.beginPath();g.ellipse(x+1,y+1.3,r,r*.75,0,0,7);g.fill();
    g.fillStyle=`rgb(${l+t},${l+t*.6},${l-8})`;g.beginPath();g.ellipse(x,y,r,r*.75,Math.random()*3,0,7);g.fill()}
  },{repeat:true});
  gravel.repeat.set(.75,360);
  const shoulders=[];
  for(const s of [-1,1]){const m=new T.Mesh(new T.PlaneGeometry(1.5,720),new T.MeshStandardMaterial({map:gravel,bumpMap:gravel,bumpScale:.03,roughness:1}));m.rotation.x=-Math.PI/2;m.position.set(s*(ROAD_W/2+.75),.03,0);m.receiveShadow=true;scene.add(m);shoulders.push(m)}

  const grassT=tex(256,256,(g,w,h)=>{g.fillStyle='#62803c';g.fillRect(0,0,w,h);
   for(let i=0;i<1400;i++){g.fillStyle=`hsla(${80+Math.random()*30},${35+Math.random()*25}%,${22+Math.random()*22}%,.55)`;g.fillRect(Math.random()*w,Math.random()*h,1+Math.random()*2,3+Math.random()*7)}
   speckle(g,w,h,22,0)},{repeat:true});
  grassT.repeat.set(1600/6,1600/6);
  const grass=new T.Mesh(new T.PlaneGeometry(1600,1600),new T.MeshStandardMaterial({map:grassT,roughness:1}));
  grass.rotation.x=-Math.PI/2;grass.receiveShadow=true;scene.add(grass);

  // Start line at 0 m
  const checker=tex(256,32,(g)=>{for(let i=0;i<16;i++)for(let j=0;j<2;j++){g.fillStyle=(i+j)%2?'#f2f2ee':'#1b1c1e';g.fillRect(i*16,j*16,16,16)}});
  const start=new T.Mesh(new T.PlaneGeometry(ROAD_W-.8,.9),new T.MeshStandardMaterial({map:checker,roughness:.8}));
  start.rotation.x=-Math.PI/2;start.position.set(0,.06,0);start.receiveShadow=true;scene.add(start);

  // ---------- distance boards every 10 m (left verge) ----------
  const BOARDS=28,boardPool=[];
  const postGeo=new T.CylinderGeometry(.045,.05,1.6,10),postMat=new T.MeshStandardMaterial({color:lin('#e9ecee'),roughness:.5,metalness:.4});
  const boardGeo=new T.BoxGeometry(.9,.46,.04),edgeMat=new T.MeshStandardMaterial({color:lin('#d5d9dc'),metalness:.6,roughness:.35});
  for(let i=0;i<BOARDS;i++){
   const c=document.createElement('canvas');c.width=256;c.height=132;const t=new T.CanvasTexture(c);t.encoding=T.sRGBEncoding;t.anisotropy=ANISO;
   const face=new T.MeshStandardMaterial({map:t,roughness:.45,metalness:.05});
   const grp=new T.Group(),post=new T.Mesh(postGeo,postMat),board=new T.Mesh(boardGeo,[edgeMat,edgeMat,edgeMat,edgeMat,face,edgeMat]);
   post.position.y=.8;board.position.y=1.48;post.castShadow=board.castShadow=true;grp.add(post,board);grp.rotation.y=.5;grp.position.x=-(ROAD_W/2+1.9);
   scene.add(grp);boardPool.push({grp,c,t,k:null});
  }
  function drawBoard(b,k){
   const g=b.c.getContext('2d'),m=k*10,major=m%50===0;
   g.fillStyle=major?'#f2c230':'#1d6a45';g.fillRect(0,0,256,132);
   g.strokeStyle=major?'#1b1b1b':'#f4f4f0';g.lineWidth=7;g.strokeRect(8,8,240,116);
   g.fillStyle=major?'#151515':'#ffffff';g.textAlign='center';g.textBaseline='middle';g.font='800 64px IBM Plex Sans,Roboto,sans-serif';
   g.fillText(m+' m',128,70);b.t.needsUpdate=true;
  }

  // ---------- instanced scenery: trees, bushes, roadside posts, fields ----------
  function inst(geo,mat,cap,shadow){const m=new T.InstancedMesh(geo,mat,cap);m.frustumCulled=false;m.castShadow=!!shadow;m.receiveShadow=true;
   const white=new T.Color(1,1,1);for(let i=0;i<cap;i++)m.setColorAt(i,white); // must run while count===cap (r128 sizes the colour buffer from count)
   m.count=0;scene.add(m);return m}
  // merge several non-indexed geometries into one
  function mergeGeos(list){const pos=[],nor=[],uv=[],col=[];let hasCol=false;
   for(const g0 of list){const g=g0.index?g0.toNonIndexed():g0,p=g.attributes.position,n=g.attributes.normal,u=g.attributes.uv,c=g.attributes.color;if(c)hasCol=true;
    for(let i=0;i<p.count;i++){pos.push(p.getX(i),p.getY(i),p.getZ(i));nor.push(n.getX(i),n.getY(i),n.getZ(i));uv.push(u?u.getX(i):0,u?u.getY(i):0);if(c)col.push(c.getX(i),c.getY(i),c.getZ(i));else col.push(1,1,1)}}
   const out=new T.BufferGeometry();out.setAttribute('position',new T.Float32BufferAttribute(pos,3));out.setAttribute('normal',new T.Float32BufferAttribute(nor,3));out.setAttribute('uv',new T.Float32BufferAttribute(uv,2));
   if(hasCol)out.setAttribute('color',new T.Float32BufferAttribute(col,3));return out}
  // canopy = cluster of lumpy leaf-blobs; normals bent outward from the crown centre, darker underneath and inside (ambient occlusion)
  function canopyGeo(blobs,detail,jitter,seed,uvRep){
   const parts=[];let ymin=1e9,ymax=-1e9;
   blobs.forEach((b,bi)=>{const g=new T.IcosahedronGeometry(1,detail),p=g.attributes.position,n=g.attributes.normal,u=g.attributes.uv;
    for(let i=0;i<p.count;i++){const x=p.getX(i),y=p.getY(i),z=p.getZ(i);
     const dd=1+(h2(Math.round(x*40)+500,Math.round(y*40)*31+Math.round(z*40)*977+500,seed+bi)-.5)*jitter;
     p.setXYZ(i,b[0]+x*b[3]*dd,b[1]+y*b[3]*b[4]*dd,b[2]+z*b[3]*dd);u.setXY(i,u.getX(i)*uvRep,u.getY(i)*uvRep);ymin=Math.min(ymin,p.getY(i));ymax=Math.max(ymax,p.getY(i))}
    parts.push(g)});
   const g=mergeGeos(parts),p=g.attributes.position,n=g.attributes.normal,col=[],v=new T.Vector3(),c=new T.Vector3();
   let rmax=0;for(let i=0;i<p.count;i++)rmax=Math.max(rmax,Math.hypot(p.getX(i),p.getZ(i)));
   for(let i=0;i<p.count;i++){v.set(p.getX(i),p.getY(i),p.getZ(i));c.set(0,(ymin+ymax)/2,0);const out=v.clone().sub(c).normalize();
    const nn=new T.Vector3(n.getX(i),n.getY(i),n.getZ(i)).multiplyScalar(.45).add(out.multiplyScalar(.55)).normalize();n.setXYZ(i,nn.x,nn.y,nn.z);
    const hy=(v.y-ymin)/(ymax-ymin),rr=Math.hypot(v.x,v.z)/rmax,ao=.42+.4*hy+.25*rr;const a=Math.min(1.08,ao);col.push(a,a,a*.97)}
   g.setAttribute('color',new T.Float32BufferAttribute(col,3));return g}
  // bark textures
  const barkDark=tex(64,256,(g,w,h)=>{g.fillStyle='#4a3a2c';g.fillRect(0,0,w,h);for(let i=0;i<70;i++){const x=Math.random()*w;g.strokeStyle=`rgba(${20+Math.random()*30},${15+Math.random()*20},10,.7)`;g.lineWidth=1+Math.random()*2.5;g.beginPath();g.moveTo(x,0);for(let y=0;y<=h;y+=16)g.lineTo(x+Math.sin(y*.05+i)*3,y);g.stroke()}speckle(g,w,h,30,.02)},{repeat:true});
  const barkPale=tex(64,256,(g,w,h)=>{g.fillStyle='#d9d4c6';g.fillRect(0,0,w,h);
   for(let i=0;i<40;i++){g.fillStyle=['rgba(176,160,132,.75)','rgba(150,150,140,.6)','rgba(205,190,160,.8)','rgba(120,110,95,.45)'][i%4];const x=Math.random()*w,y=Math.random()*h;g.beginPath();g.ellipse(x,y,3+Math.random()*9,8+Math.random()*30,0,0,7);g.fill()}
   speckle(g,w,h,18,0)},{repeat:true});
  const leafTex=(base,cols,gaps)=>tex(256,256,(g,w,h)=>{g.clearRect(0,0,w,h);
   const blob=(x,y,r)=>{for(const ox of [-w,0,w])for(const oy of [-h,0,h]){g.beginPath();g.arc(x+ox,y+oy,r,0,7);g.fill()}};
   g.fillStyle=base;for(let i=0;i<gaps;i++)blob(Math.random()*w,Math.random()*h,6+Math.random()*12);  // leaf clumps; the rest stays see-through
   for(let i=0;i<2600;i++){g.fillStyle=cols[i%cols.length];g.save();g.translate(Math.random()*w,Math.random()*h);g.rotate(Math.random()*7);g.beginPath();g.ellipse(0,0,2.2+Math.random()*2.5,1+Math.random()*1.2,0,0,7);g.fill();g.restore()}
  },{repeat:true});
  const broadLeaf=leafTex('#3d6328',['#4f7a31','#5d8a38','#365a24','#6e9b42','#2f4f20','#7fa64a'],420);
  const eucLeaf=leafTex('#55704a',['#6f8a62','#7d9870','#4b6342','#8ba37a','#5c7552','#a2b48c'],190);
  // geometry: broadleaf (shisham/neem-like) trunk with two limbs, and tall slender eucalyptus
  const bend=(g,amt,f)=>{const p=g.attributes.position;for(let i=0;i<p.count;i++){const y=p.getY(i);p.setX(i,p.getX(i)+Math.sin(y*f)*amt)}g.computeVertexNormals();return g};
  const limb=(r0,r1,len,rz,rx,y)=>new T.CylinderGeometry(r1,r0,len,7).translate(0,len/2,0).rotateZ(rz).rotateX(rx).translate(0,y,0);
  const broadTrunkGeo=mergeGeos([bend(new T.CylinderGeometry(.15,.24,3.0,9,5).translate(0,1.5,0),.06,1.3),limb(.11,.06,1.5,.65,.2,2.3),limb(.1,.05,1.4,-.55,-.3,2.5),limb(.08,.04,1.1,.15,.7,2.7)]);
  const eucTrunkGeo=mergeGeos([bend(new T.CylinderGeometry(.09,.18,8.6,9,8).translate(0,4.3,0),.12,.45),limb(.06,.03,1.6,.5,.1,6.2),limb(.05,.03,1.4,-.6,-.2,6.8)]);
  const broadCanGeo=canopyGeo([[0,0,0,1.55,.78],[1.15,.15,.35,1.15,.8],[-1.05,.1,-.4,1.2,.78],[.25,.55,-1.0,1.05,.82],[-.35,.65,.95,1.05,.8],[.4,-.35,.2,1.1,.6],[-.2,1.0,-.1,1.0,.7]],1,.38,11,2.2);
  const eucCanGeo=canopyGeo([[0,0,0,.95,1.2],[.95,.9,.3,.7,1.25],[-.85,.6,-.4,.72,1.3],[.3,1.9,-.3,.66,1.2],[-.45,-1.0,.45,.6,1.2],[.6,-.6,-.6,.55,1.25],[-.3,2.6,.25,.5,1.1],[1.1,-.2,-.2,.5,1.3],[-1.0,1.6,.3,.55,1.2]],1,.6,23,1.6);
  const bushGeo=canopyGeo([[0,0,0,.8,.7],[.6,-.05,.2,.6,.7],[-.55,-.05,-.15,.62,.7]],1,.4,37,1.5);
  const leafMat=new T.MeshStandardMaterial({map:broadLeaf,roughness:.85,vertexColors:true,alphaTest:.45,side:T.DoubleSide});
  const eucMat=new T.MeshStandardMaterial({map:eucLeaf,roughness:.85,vertexColors:true,alphaTest:.45,side:T.DoubleSide});
  const trunkI=inst(broadTrunkGeo,new T.MeshStandardMaterial({map:barkDark,bumpMap:barkDark,bumpScale:.05,roughness:1}),240,true);
  const eucTrunkI=inst(eucTrunkGeo,new T.MeshStandardMaterial({map:barkPale,bumpMap:barkPale,bumpScale:.03,roughness:.9}),240,true);
  const roundI=inst(broadCanGeo,leafMat,240,true);
  const coneI=inst(eucCanGeo,eucMat,240,true);
  const bushI=inst(bushGeo,leafMat,320,true);
  const delinI=inst(new T.CylinderGeometry(.05,.06,1,8).translate(0,.5,0),new T.MeshStandardMaterial({color:lin('#f4f4f2'),roughness:.4}),60,true);
  const reflI=inst(new T.BoxGeometry(.07,.16,.12).translate(0,.86,0),new T.MeshStandardMaterial({color:lin('#ff8a1e'),emissive:lin('#ff6a00'),emissiveIntensity:.35,roughness:.3}),60,false);
  const studI=inst(new T.BoxGeometry(.1,.025,.12).translate(0,.06,0),new T.MeshStandardMaterial({color:lin('#e8e4d6'),emissive:lin('#ffcf6a'),emissiveIntensity:.25,metalness:.5,roughness:.3}),60,false);
  const furrows=tex(64,256,(g,w,h)=>{g.fillStyle='#ffffff';g.fillRect(0,0,w,h);for(let y=0;y<h;y+=16){g.fillStyle='rgba(0,0,0,.18)';g.fillRect(0,y,w,7)}speckle(g,w,h,30,0)});
  const fieldI=inst(new T.BoxGeometry(1,.06,1),new T.MeshStandardMaterial({map:furrows,roughness:1}),120,false);
  const hillMat=new T.MeshStandardMaterial({color:lin('#6f8a86'),roughness:1,flatShading:true});
  const hills=new T.Group();scene.add(hills);
  for(let i=0;i<22;i++){const ang=(i/22)*Math.PI*2+hash(i)*0.2,dist=640+hash(i+40)*260,hgt=40+hash(i+80)*90;
   const m=new T.Mesh(new T.ConeGeometry(110+hash(i+9)*140,hgt,7),hillMat);m.position.set(Math.cos(ang)*dist,hgt/2-6,Math.sin(ang)*dist);m.rotation.y=hash(i+3)*6;hills.add(m)}

  const M=new T.Matrix4(),Q=new T.Quaternion(),P=new T.Vector3(),S=new T.Vector3(),C=new T.Color(),YA=new T.Vector3(0,1,0);
  const put=(mesh,i,x,y,z,sx,sy,sz,rot,col)=>{Q.setFromAxisAngle(YA,rot);P.set(x,y,z);S.set(sx,sy,sz);M.compose(P,Q,S);mesh.setMatrixAt(i,M);if(col)mesh.setColorAt(i,col)};
  const leafCols=['#ffffff','#e6f0d6','#f3ecc8','#d6e6cf','#c9dcb8'].map(lin),pineCols=['#ffffff','#e9eedd','#dfe6d2'].map(lin),bushCols=['#ffffff','#e2edd0','#f0e8c6'].map(lin);
  const fieldCols=['#c8a54a','#d7c13a','#6f9a3c','#86a845','#9b8455','#b9ae52'].map(lin);
  let lastTreeK=null,lastFieldK=null;
  function updateScenery(s){
   const tk=Math.floor((s-70)/6);
   if(tk!==lastTreeK){lastTreeK=tk;let nt=0,nr=0,nc=0,nb=0,nd=0,ne=0,ns=0;
    for(let k=tk;k<=tk+66;k++)for(const side of [-1,1]){const sd=k*2+(side>0?1:0);
     if(hash(sd*1.7+.3)>=.42){const r2=hash(sd*3.1+7),r3=hash(sd*5.3+1),r4=hash(sd*9.7+3),sc=.75+r4*.7,x=side*(8+r2*12),z=-(k*6+r3*5);
      if(r4>.58){const es=.85+(r4-.58)*.9,ex=side*(6.6+r2*1.4);           // eucalyptus row close to the road
       put(eucTrunkI,ne++,ex,0,z,es,es,es,r3*6);put(coneI,nc++,ex,7.9*es,z,es,es,es,r2*6,pineCols[Math.floor(r2*3)%3]);}
      else{put(trunkI,nt++,x+side*2.5,0,z,sc,sc,sc,r3*6);put(roundI,nr++,x+side*2.5,3.75*sc,z,sc*(1+r3*.15),sc,sc,r2*6,leafCols[Math.floor(r3*5)%5]);}}
     for(let b=0;b<2;b++){const sb=sd*3.3+b*17.1;if(hash(sb)<.45)continue;const bx=side*(8.4+hash(sb+2)*4),bz=-(k*6+hash(sb+5)*6),bs=.45+hash(sb+8)*.6;
      put(bushI,nb++,bx,bs*.5,bz,bs*1.3,bs,bs*1.2,hash(sb+1)*6,bushCols[Math.floor(hash(sb+3)*3)%3]);}}
    const dk=Math.floor((s-40)/10);
    for(let k=dk;k<=dk+40;k++){const z=-(k*10+5);put(delinI,nd,ROAD_W/2+1.75,0,z,1,1,1,0);put(reflI,nd,ROAD_W/2+1.75,0,z,1,1,1,0);nd++}
    const sk=Math.floor((s-40)/12);for(let k=sk;k<=sk+30;k++)put(studI,ns++,0,0,-12*k+10,1,1,1,0); // sits in the gaps between centre dashes
    trunkI.count=nt;eucTrunkI.count=ne;roundI.count=nr;coneI.count=nc;bushI.count=nb;delinI.count=reflI.count=nd;studI.count=ns;
    for(const m of [trunkI,eucTrunkI,roundI,coneI,bushI,delinI,reflI,studI]){m.instanceMatrix.needsUpdate=true;if(m.instanceColor)m.instanceColor.needsUpdate=true}
   }
   const fk=Math.floor((s-150)/60);
   if(fk!==lastFieldK){lastFieldK=fk;let nf=0;
    for(let k=fk;k<=fk+15;k++)for(const side of [-1,1])for(let col=0;col<3;col++){const sd=k*7+col*3+(side>0?1:0)*31;
     put(fieldI,nf++,side*(42+col*46),.035,-(k*60+30),42,1,55,0,fieldCols[Math.floor(hash(sd)*6)%6])}
    fieldI.count=nf;fieldI.instanceMatrix.needsUpdate=true;fieldI.instanceColor.needsUpdate=true;
   }
   const base=Math.floor(s/10)-4;
   for(let i=0;i<BOARDS;i++){const k=base+i,b=boardPool[((k%BOARDS)+BOARDS)%BOARDS];
    if(b.k!==k){b.k=k;b.grp.visible=k>=0;if(k>=0){b.grp.position.z=-k*10;drawBoard(b,k)}}}
   const snap=Math.round(-s/PERIOD)*PERIOD;
   road.position.z=snap-250;for(const m of shoulders)m.position.z=snap-250;grass.position.z=snap;
  }

  // ---------- the car (Indian right-hand-drive sedan, drives in the left lane) ----------
  const car=new T.Group(),chassis=new T.Group();car.add(chassis);scene.add(car);
  const paint=new T.MeshPhysicalMaterial({color:lin('#a8102a'),metalness:.45,roughness:.27,clearcoat:1,clearcoatRoughness:.04,envMapIntensity:1.25});
  const trim=new T.MeshStandardMaterial({color:lin('#141618'),roughness:.55,metalness:.2});
  const interior=new T.MeshStandardMaterial({color:lin('#1d2023'),roughness:.85});
  const glass=new T.MeshPhysicalMaterial({color:lin('#0a131a'),metalness:.1,roughness:.03,transparent:true,opacity:.8,envMapIntensity:1.8});
  const glassSide=glass.clone();glassSide.side=T.DoubleSide;
  const chrome=new T.MeshStandardMaterial({color:lin('#dde2e6'),metalness:1,roughness:.16});
  const headMat=new T.MeshStandardMaterial({color:lin('#eef3f7'),emissive:lin('#e4edff'),emissiveIntensity:.55,metalness:.4,roughness:.08});
  const tailMat=new T.MeshStandardMaterial({color:lin('#4a070b'),emissive:lin('#ff1d1d'),emissiveIntensity:.3,roughness:.25});
  const extRaw=(shape,depth,bt,bs,seg=5)=>{const g=new T.ExtrudeGeometry(shape,{depth,bevelEnabled:true,bevelThickness:bt,bevelSize:bs,bevelSegments:seg,curveSegments:28,steps:1});g.translate(0,0,-depth/2);g.rotateY(Math.PI/2);return g};
  const ext=(shape,depth,bt,bs)=>creased(extRaw(shape,depth,bt,bs),.62);
  // Body sculpting: rounded nose/tail in plan view, tucked-in sills, crowned bonnet/boot; cabin leans inward (tumblehome) with a crowned roof
  const sm=(a,b,x)=>{const t=Math.min(1,Math.max(0,(x-a)/(b-a)));return t*t*(3-2*t)};
  const bodyF=v=>{const t=sm(1.5,2.4,Math.abs(v.z));v.x*=1-.13*t*t;v.x*=1-.05*sm(.5,.2,v.y);if(v.y>.6)v.y+=.035*Math.max(0,1-(v.x/.92)**2)*sm(.6,.8,v.y)};
  const cabF=v=>{v.x*=1-.14*Math.min(1,Math.max(0,(v.y-.92)/.53));if(v.y>1.3)v.y+=.03*Math.max(0,1-(v.x/.66)**2)*sm(1.32,1.44,v.y)};
  const deform=(g,f)=>{const p=g.attributes.position,v=new T.Vector3();for(let i=0;i<p.count;i++){v.fromBufferAttribute(p,i);f(v);p.setXYZ(i,v.x,v.y,v.z)}return g};
  const addD=(geo,mat,x,y,z,f,shadow=false)=>{const g=deform(geo.clone().translate(x,y,z),f);if(g.index)g.computeVertexNormals();return add(g,mat,0,0,0,chassis,shadow)};
  const add=(geo,mat,x,y,z,parent=chassis,shadow=true)=>{const m=new T.Mesh(geo,mat);m.position.set(x,y,z);m.castShadow=shadow;m.receiveShadow=true;parent.add(m);return m};

  // Body side profile (x = along the car, front positive; y = height). Wheel arches cut out; cabin floor dropped inside.
  const body=new T.Shape();
  body.moveTo(-2.28,.45);body.lineTo(-2.2,.24);body.lineTo(-1.84,.24);body.lineTo(-1.82,.33);
  body.absarc(-1.4,.33,.42,Math.PI,0,true);body.lineTo(-.96,.24);body.lineTo(.96,.24);body.lineTo(.98,.33);
  body.absarc(1.4,.33,.42,Math.PI,0,true);body.lineTo(1.84,.24);body.lineTo(2.2,.26);
  body.quadraticCurveTo(2.35,.3,2.33,.5);body.lineTo(2.3,.66);body.quadraticCurveTo(2.26,.77,2.0,.8);
  body.lineTo(.95,.92);body.lineTo(.9,.72);body.lineTo(-1.3,.72);body.lineTo(-1.35,.95);body.lineTo(-2.05,.93);body.quadraticCurveTo(-2.28,.9,-2.3,.75);body.lineTo(-2.28,.45);
  add(creased(deform(extRaw(body,1.7,.07,.05),bodyF),.78),paint,0,0,0);
  const doorTop=new T.Shape();doorTop.moveTo(.97,.7);doorTop.lineTo(.97,.92);doorTop.lineTo(-1.37,.95);doorTop.lineTo(-1.37,.7);doorTop.lineTo(.97,.7);
  for(const s of [-1,1])add(creased(deform(extRaw(doorTop,.16,.02,.02).translate(s*.82,0,0),bodyF),.62),paint,0,0,0);
  const cabin=new T.Shape();
  cabin.moveTo(1.02,.88);cabin.lineTo(.22,1.36);cabin.quadraticCurveTo(-.3,1.44,-.88,1.38);cabin.lineTo(-1.62,.92);cabin.lineTo(1.02,.88);
  add(creased(deform(extRaw(cabin,1.36,.07,.06),cabF),.62),paint,0,0,0);

  // Glasshouse: black window surround, side glass, B-pillar, chrome sill strip (all follow the cabin's inward lean)
  const winShape=pts=>{const s=new T.Shape();s.moveTo(pts[0][0],pts[0][1]);for(let i=1;i<pts.length;i++)s.lineTo(pts[i][0],pts[i][1]);return s};
  const sideGeo=pts=>new T.ShapeGeometry(winShape(pts)).rotateY(Math.PI/2);
  const blackGloss=new T.MeshStandardMaterial({color:lin('#0b0c0d'),roughness:.15,metalness:.3});
  const surround=sideGeo([[.92,.93],[.21,1.35],[-.3,1.385],[-.86,1.365],[-1.52,.93]]);
  const fw=sideGeo([[.86,.97],[.2,1.31],[-.27,1.335],[-.27,.97]]),rw=sideGeo([[-.37,.97],[-.37,1.335],[-.84,1.325],[-1.42,.97]]);
  for(const s of [-1,1]){
   const flip=g=>{if(s>0)return g;const m=g.clone().scale(-1,1,1),ix=m.index.array;for(let i=0;i<ix.length;i+=3){const t=ix[i+1];ix[i+1]=ix[i+2];ix[i+2]=t}return m}; // mirror + rewind so faces point outward
   addD(flip(surround),blackGloss,s*.752,0,0,cabF);
   addD(flip(fw),glassSide,s*.756,0,0,cabF);addD(flip(rw),glassSide,s*.756,0,0,cabF);
   addD(new T.BoxGeometry(.006,.014,2.36,1,1,8),chrome,s*.759,.955,.27,cabF);
  }
  // Windscreen and rear glass: quads lying on the sloped cabin faces
  function slopeGlass(p1,p2,halfBot,halfTop,off){
   const d=new T.Vector2(p2[0]-p1[0],p2[1]-p1[1]).normalize(),n=new T.Vector2(-d.y,d.x);if(n.x*(p1[0]>0?1:-1)<0)n.negate();
   const a=[p1[0]+d.x*.05+n.x*off,p1[1]+d.y*.05+n.y*off],b=[p2[0]-d.x*.04+n.x*off,p2[1]-d.y*.04+n.y*off];
   const v=[-halfBot,a[1],-a[0], halfBot,a[1],-a[0], halfTop,b[1],-b[0], -halfTop,b[1],-b[0]];
   const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(v,3));g.setIndex([0,1,2,0,2,3]);g.computeVertexNormals();
   const nz=g.attributes.normal.getZ(0),want=p1[0]>0?-1:1;if(Math.sign(nz)!==want){g.setIndex([0,2,1,0,3,2]);g.computeVertexNormals()}
   return deform(g,cabF);
  }
  add(slopeGlass([1.02,.88],[.22,1.36],.68,.62,.068),glass,0,0,0,chassis,false);
  add(slopeGlass([-1.62,.92],[-.88,1.38],.66,.6,.068),glass,0,0,0,chassis,false);

  // Headlamp units: black housing, chrome reflector, projector lens, LED daytime strip, clear cover
  const clearGlass=new T.MeshPhysicalMaterial({color:0xffffff,metalness:0,roughness:0,transparent:true,opacity:.18,envMapIntensity:2});
  const tailLens=new T.MeshPhysicalMaterial({color:lin('#6a0c13'),metalness:.2,roughness:.12,clearcoat:1,envMapIntensity:1.4});
  const reverseMat=new T.MeshStandardMaterial({color:lin('#e8e8e8'),metalness:.6,roughness:.15});
  const glows=[];
  for(const s of [-1,1]){
   const hl=new T.Group();hl.position.set(s*.56,.67,-2.29);hl.rotation.y=s*.14;chassis.add(hl);
   add(new T.BoxGeometry(.42,.13,.1),trim,0,0,0,hl,false);
   add(new T.BoxGeometry(.38,.1,.02),chrome,0,0,-.045,hl,false);
   add(new T.SphereGeometry(.038,20,12),glass,s*-.09,-.005,-.055,hl,false);
   add(new T.SphereGeometry(.03,20,12),glass,s*.05,-.005,-.055,hl,false);
   add(new T.BoxGeometry(.36,.014,.012),headMat,0,.046,-.058,hl,false);
   add(new T.BoxGeometry(.43,.135,.012),clearGlass,0,0,-.062,hl,false);
   const tl=new T.Group();tl.position.set(s*.56,.8,2.31);tl.rotation.y=-s*.1;chassis.add(tl);
   add(new T.BoxGeometry(.42,.12,.07),tailLens,0,0,0,tl,false);
   add(new T.BoxGeometry(.36,.012,.01),tailMat,0,.028,.037,tl,false);add(new T.BoxGeometry(.36,.012,.01),tailMat,0,-.012,.037,tl,false);
   add(new T.BoxGeometry(.07,.04,.01),reverseMat,s*-.15,-.038,.037,tl,false);
   const sp=new T.Sprite(new T.SpriteMaterial({map:glowTex,color:0xff2a1a,blending:T.AdditiveBlending,depthWrite:false,transparent:true,opacity:0}));
   sp.position.set(s*.56,.8,2.42);sp.scale.set(1,.6,1);chassis.add(sp);glows.push(sp);
   // mirrors (body colour cap, black base, glass face)
   const mg=new T.Group();mg.position.set(s*.9,1.0,-.74);mg.rotation.y=-s*.12;chassis.add(mg);
   add(new T.BoxGeometry(.12,.05,.06),trim,0,-.04,0,mg,false);
   const cap=add(new T.SphereGeometry(.1,16,10),paint,s*.1,0,0,mg);cap.scale.set(1.05,.62,.48);
   add(new T.PlaneGeometry(.17,.1),glass,s*.1,0,.046,mg,false);
   // door shut-lines, handles, sill trim — shaped to the body
   for(const zz of [-.92,.3])addD(new T.BoxGeometry(.008,.62,.008,1,10,1),trim,s*.923,.6,zz,bodyF);
   addD(new T.BoxGeometry(.008,.5,.008,1,10,1),trim,s*.923,.66,.98,bodyF);
   for(const zz of [.12,.86]){addD(new T.BoxGeometry(.016,.032,.16,1,1,4),chrome,s*.928,.84,zz,bodyF);addD(new T.BoxGeometry(.004,.05,.2),trim,s*.921,.84,zz,bodyF)}
   addD(new T.BoxGeometry(.05,.08,1.86,1,4,8),trim,s*.88,.28,0,bodyF);
   addD(new T.BoxGeometry(.01,.012,3.2,1,1,16),chrome,s*.905,.55,.1,bodyF);    // body-side chrome strip
  }
  const brakeHi=add(new T.BoxGeometry(.4,.03,.03),tailMat,0,1.05,1.66,chassis,false);brakeHi.rotation.x=.55;
  // Honeycomb grille with chrome surround and badge
  const hexTex=tex(256,64,(g,w,h)=>{g.fillStyle='#050505';g.fillRect(0,0,w,h);g.strokeStyle='#3a3d40';g.lineWidth=2;
   for(let y=0;y<h+8;y+=9)for(let x=(y/9)%2?5:0;x<w+10;x+=10){g.beginPath();for(let k=0;k<6;k++){const a=k*Math.PI/3+Math.PI/6;g.lineTo(x+5*Math.cos(a),y+5*Math.sin(a))}g.closePath();g.stroke()}});
  add(new T.PlaneGeometry(.8,.17),new T.MeshStandardMaterial({map:hexTex,roughness:.5,metalness:.3}),0,.5,-2.372,chassis,false).rotation.y=Math.PI;
  add(new T.BoxGeometry(.84,.018,.03),chrome,0,.592,-2.365,chassis,false);
  const badge=add(new T.CylinderGeometry(.045,.045,.012,24).rotateX(Math.PI/2).scale(1.3,1,1),chrome,0,.5,-2.38,chassis,false);
  add(new T.BoxGeometry(1.4,.07,.06),trim,0,.3,-2.33);add(new T.BoxGeometry(1.5,.08,.06),trim,0,.37,2.34);
  for(const s of [-1,1])add(new T.CylinderGeometry(.04,.04,.02,16).rotateX(Math.PI/2),glass,s*.55,.33,-2.36,chassis,false);   // fog lamps
  const plateTex=tex(256,56,(g)=>{g.fillStyle='#f6f6f2';g.fillRect(0,0,256,56);g.strokeStyle='#111';g.lineWidth=4;g.strokeRect(3,3,250,50);g.fillStyle='#111';g.font='700 34px IBM Plex Mono,Roboto Mono,monospace';g.textAlign='center';g.textBaseline='middle';g.fillText('PB 10 QX 2026',128,30)});
  const plateMat=new T.MeshStandardMaterial({map:plateTex,roughness:.4});
  add(new T.PlaneGeometry(.52,.115),plateMat,0,.39,-2.395,chassis,false).rotation.y=Math.PI;
  add(new T.PlaneGeometry(.52,.115),plateMat,0,.57,2.36,chassis,false);
  // Dark wheel-arch liners so you don't see red paint inside the arches
  const linerMat=new T.MeshStandardMaterial({color:lin('#0a0a0b'),roughness:1,envMapIntensity:0,side:T.DoubleSide});
  for(const zz of [-1.4,1.4])add(new T.CylinderGeometry(.375,.375,1.74,28,1,true,0,Math.PI).rotateZ(Math.PI/2),linerMat,0,.333,zz,chassis,false);

  // ---------- Interior (seen through the glass, and from the driver's seat) ----------
  const grain=(base,amt)=>tex(128,128,(g,w,h)=>{g.fillStyle=base;g.fillRect(0,0,w,h);speckle(g,w,h,amt,.04)},{repeat:true});
  const dashMat=new T.MeshStandardMaterial({color:lin('#26292c'),map:grain('#d0d0d0',26),bumpMap:grain('#808080',60),bumpScale:.004,roughness:.8});
  const leather=new T.MeshStandardMaterial({color:lin('#1a1a1c'),bumpMap:grain('#808080',80),bumpScale:.003,roughness:.55});
  const seatMat=new T.MeshStandardMaterial({color:lin('#2b2622'),bumpMap:grain('#808080',70),bumpScale:.004,roughness:.75});
  const satin=new T.MeshStandardMaterial({color:lin('#8f969c'),metalness:.9,roughness:.35});
  const addI=(geo,mat,x,y,z,parent=chassis)=>{const m=add(geo,mat,x,y,z,parent,false);m.receiveShadow=false;return m};
  const floor=addI(new T.PlaneGeometry(1.44,2.3),interior,0,.8,.2);floor.rotation.x=-Math.PI/2;
  // dashboard: sculpted profile, full width
  const dashS=new T.Shape();dashS.moveTo(.52,.8);dashS.lineTo(.52,.9);dashS.quadraticCurveTo(.53,.99,.66,1.0);dashS.lineTo(.9,.985);dashS.lineTo(.99,.93);dashS.lineTo(.99,.8);dashS.lineTo(.52,.8);
  addI(ext(dashS,1.42,.02,.02),dashMat,0,0,0);
  // instrument-cluster cowl and live gauges (speed + distance shown on the car's own dashboard)
  const cowl=new T.Shape();cowl.moveTo(.56,1.07);cowl.quadraticCurveTo(.6,1.1,.7,1.1);cowl.lineTo(.82,1.08);cowl.lineTo(.82,1.06);cowl.lineTo(.7,1.08);cowl.quadraticCurveTo(.62,1.08,.575,1.055);cowl.lineTo(.56,1.07);
  const cowlM=addI(ext(cowl,.34,.012,.012),dashMat,0,0,0);cowlM.position.x=.37;
  const clusterC=document.createElement('canvas');clusterC.width=512;clusterC.height=170;const clusterT=new T.CanvasTexture(clusterC);clusterT.encoding=T.sRGBEncoding;clusterT.anisotropy=ANISO;
  function drawCluster(kmh,dist){const g=clusterC.getContext('2d');g.fillStyle='#040506';g.fillRect(0,0,512,170);
   const dial=(cx,max,step,val,label)=>{const r=72,a0=Math.PI*.75,a1=Math.PI*2.25;g.strokeStyle='#2c3338';g.lineWidth=3;g.beginPath();g.arc(cx,88,r,a0,a1);g.stroke();
    g.fillStyle='#cfd8de';g.font='600 13px IBM Plex Sans,Roboto,sans-serif';g.textAlign='center';g.textBaseline='middle';
    for(let v=0;v<=max;v+=step/2){const a=a0+(v/max)*(a1-a0),big=v%step===0;g.strokeStyle=big?'#e8eef2':'#6c767d';g.lineWidth=big?3:1.5;g.beginPath();g.moveTo(cx+Math.cos(a)*(r-2),88+Math.sin(a)*(r-2));g.lineTo(cx+Math.cos(a)*(r-(big?13:8)),88+Math.sin(a)*(r-(big?13:8)));g.stroke();
     if(big)g.fillText(String(v),cx+Math.cos(a)*(r-26),88+Math.sin(a)*(r-26))}
    const a=a0+Math.min(1,val/max)*(a1-a0);g.strokeStyle='#ff4a2a';g.lineWidth=4;g.beginPath();g.moveTo(cx,88);g.lineTo(cx+Math.cos(a)*(r-10),88+Math.sin(a)*(r-10));g.stroke();
    g.fillStyle='#1b2024';g.beginPath();g.arc(cx,88,9,0,7);g.fill();g.fillStyle='#8a959c';g.font='600 11px IBM Plex Sans,Roboto,sans-serif';g.fillText(label,cx,132)};
   dial(96,100,20,kmh,'km/h');dial(416,7,1,.8+Math.min(5,kmh/18),'×1000 rpm');
   g.fillStyle='#0b1418';g.fillRect(196,40,120,90);g.strokeStyle='#1e3a44';g.lineWidth=2;g.strokeRect(196,40,120,90);
   g.fillStyle='#54d6e8';g.textAlign='center';g.font='700 34px IBM Plex Sans,Roboto,sans-serif';g.fillText(String(Math.round(kmh)),256,74);
   g.font='600 11px IBM Plex Sans,Roboto,sans-serif';g.fillStyle='#7fa6b2';g.fillText('km/h',256,96);g.fillStyle='#81e0b1';g.font='600 14px IBM Plex Sans,Roboto,sans-serif';g.fillText(dist.toFixed(1)+' m',256,116);
   clusterT.needsUpdate=true}
  drawCluster(0,0);
  const cl=addI(new T.PlaneGeometry(.27,.09),new T.MeshBasicMaterial({map:clusterT}),.37,1.035,-.64);cl.rotation.x=-.3;
  // centre touchscreen and air vents
  const screen=addI(new T.PlaneGeometry(.22,.13),blackGloss,0,1.06,-.62);screen.rotation.x=-.25;
  addI(new T.BoxGeometry(.23,.14,.015),trim,0,1.06,-.628).rotation.x=-.25;
  const ventTex=tex(64,32,(g,w,h)=>{g.fillStyle='#121314';g.fillRect(0,0,w,h);g.fillStyle='#3b3f43';for(let y=3;y<h;y+=6)g.fillRect(2,y,w-4,2)});
  const ventMat=new T.MeshStandardMaterial({map:ventTex,roughness:.6});
  for(const vx of [-.6,-.11,.11,.62])addI(new T.PlaneGeometry(.1,.045),ventMat,vx,.95,-.519);
  // steering wheel: leather rim, airbag pad with badge, three spokes with buttons, column shroud and stalks
  const steer=new T.Group();steer.position.set(.37,.99,-.33);steer.rotation.x=-.45;chassis.add(steer);
  addI(new T.TorusGeometry(.175,.026,16,72),leather,0,0,0,steer);
  const rr=(w,h,r)=>{const sh=new T.Shape();sh.moveTo(-w/2+r,-h/2);sh.lineTo(w/2-r,-h/2);sh.quadraticCurveTo(w/2,-h/2,w/2,-h/2+r);sh.lineTo(w/2,h/2-r);sh.quadraticCurveTo(w/2,h/2,w/2-r,h/2);sh.lineTo(-w/2+r,h/2);sh.quadraticCurveTo(-w/2,h/2,-w/2,h/2-r);sh.lineTo(-w/2,-h/2+r);sh.quadraticCurveTo(-w/2,-h/2,-w/2+r,-h/2);return sh};
  addI(new T.ExtrudeGeometry(rr(.15,.11,.035),{depth:.03,bevelEnabled:true,bevelThickness:.012,bevelSize:.01,bevelSegments:3,curveSegments:8}),leather,0,-.005,-.03,steer);
  addI(new T.CircleGeometry(.017,24).scale(1.35,1,1),chrome,0,-.003,.0135,steer);
  for(const sx of [-1,1]){addI(new T.BoxGeometry(.09,.04,.018),leather,sx*.12,-.012,-.012,steer);
   for(const by of [.004,-.026])addI(new T.BoxGeometry(.018,.012,.006),satin,sx*.115,by,-.0005,steer)}
  for(const sx of [-1,1]){const b=addI(new T.BoxGeometry(.03,.09,.018),leather,sx*.028,-.11,-.012,steer);b.rotation.z=sx*.28}
  addI(new T.CylinderGeometry(.045,.055,.28,14).rotateX(Math.PI/2),trim,0,-.005,-.17,steer);
  for(const sx of [-1,1]){const st=addI(new T.CylinderGeometry(.006,.008,.13,8),satin,sx*.1,.01,-.09,steer);st.rotation.z=Math.PI/2}
  // seats with bolsters and headrests
  for(const sx of [-.37,.37]){const seat=new T.Group();seat.position.set(sx,0,0);chassis.add(seat);
   const back=addI(new T.BoxGeometry(.48,.44,.11),seatMat,0,1.07,.56,seat);back.rotation.x=-.12;
   for(const bx of [-1,1]){const bo=addI(new T.BoxGeometry(.06,.42,.14),seatMat,bx*.23,1.06,.54,seat);bo.rotation.x=-.12}
   addI(new T.BoxGeometry(.48,.1,.48),seatMat,0,.87,.3,seat);
   addI(new T.BoxGeometry(.24,.13,.09),seatMat,0,1.31,.61,seat).rotation.x=-.12}
  for(const s of [-1,1]){const pl=addI(new T.BoxGeometry(.06,.05,.96),interior,s*.64,1.13,-.6);pl.rotation.x=-Math.atan2(.48,.8)}
  addI(new T.BoxGeometry(1.32,.05,.1),interior,0,1.37,-.21);
  const liner=addI(new T.PlaneGeometry(1.3,1.1),interior,0,1.39,.35);liner.rotation.x=Math.PI/2;
  // rear-view mirror
  addI(new T.BoxGeometry(.2,.055,.025),trim,0,1.33,-.26);addI(new T.PlaneGeometry(.185,.042),glass,0,1.33,-.247);

  // ---------- Wheels (unsprung — they stay level while the body pitches) ----------
  const tread=tex(512,64,(g,w,h)=>{g.fillStyle='#8a8a8a';g.fillRect(0,0,w,h);g.fillStyle='#2a2a2a';
   for(const v of [.38,.47,.53,.62])g.fillRect(0,v*h-2,w,4);
   for(let x=0;x<w;x+=8){g.fillRect(x,.3*h,2,.08*h);g.fillRect(x+4,.62*h,2,.08*h)}
   g.fillStyle='#6d6d6d';g.fillRect(0,0,w,.24*h);g.fillRect(0,.76*h,w,.24*h)});
  const tireMat=new T.MeshStandardMaterial({color:lin('#1d1e20'),map:tread,bumpMap:tread,bumpScale:.01,roughness:.92});
  const rimMat=new T.MeshStandardMaterial({color:lin('#c9ced3'),metalness:.75,roughness:.3,envMapIntensity:.55});
  const rimDark=new T.MeshStandardMaterial({color:lin('#2c2f32'),metalness:.6,roughness:.5,envMapIntensity:.4});
  const tireGeo=new T.LatheGeometry([[.21,-.118],[.27,-.122],[.31,-.115],[.328,-.095],[.334,-.06],[.334,.06],[.328,.095],[.31,.115],[.27,.122],[.21,.118]].map(p=>new T.Vector2(p[0],p[1])),48).rotateZ(Math.PI/2);
  const barrelGeo=new T.CylinderGeometry(.212,.212,.21,36,1,true).rotateZ(Math.PI/2);
  const lipGeo=new T.TorusGeometry(.212,.009,8,48).rotateY(Math.PI/2);
  const spokeS=new T.Shape();spokeS.moveTo(-.024,.055);spokeS.lineTo(.024,.055);spokeS.lineTo(.013,.205);spokeS.lineTo(-.013,.205);spokeS.lineTo(-.024,.055);
  const spokeGeo=new T.ExtrudeGeometry(spokeS,{depth:.028,bevelEnabled:true,bevelThickness:.006,bevelSize:.004,bevelSegments:2}).rotateY(Math.PI/2);
  const hubGeo=new T.CylinderGeometry(.065,.07,.04,24).rotateZ(Math.PI/2),nutGeo=new T.CylinderGeometry(.011,.011,.02,6).rotateZ(Math.PI/2);
  const discGeo=new T.CylinderGeometry(.17,.17,.022,32).rotateZ(Math.PI/2),discMat=new T.MeshStandardMaterial({color:lin('#76797d'),metalness:.85,roughness:.38});
  const caliperMat=new T.MeshStandardMaterial({color:lin('#c2271f'),roughness:.35,metalness:.2});
  const spinners=[];
  for(const [sx,sz] of [[-1,-1.4],[1,-1.4],[-1,1.4],[1,1.4]]){
   const w=new T.Group();w.position.set(sx*.8,.334,sz);car.add(w);
   const sp=new T.Group();w.add(sp);spinners.push(sp);
   add(tireGeo,tireMat,0,0,0,sp);add(barrelGeo,rimDark,0,0,0,sp,false);add(lipGeo,rimMat,sx*.1,0,0,sp,false);
   add(discGeo,discMat,-sx*.03,0,0,sp,false);
   for(let i=0;i<5;i++)for(const off of [-.16,.16]){const piv=new T.Group();piv.rotation.x=i*Math.PI*2/5+off;sp.add(piv);add(spokeGeo,rimMat,sx*.075-.014,0,0,piv,false)}
   add(hubGeo,rimMat,sx*.09,0,0,sp,false);
   for(let i=0;i<5;i++){const a=i*Math.PI*2/5+.63;add(nutGeo,chrome,sx*.112,Math.sin(a)*.038,Math.cos(a)*.038,sp,false)}
   add(new T.CylinderGeometry(.022,.022,.012,16).rotateZ(Math.PI/2),rimDark,sx*.118,0,0,sp,false);
   add(new T.BoxGeometry(.06,.1,.12),caliperMat,sx*.02,.1,.12,w,false);
  }
  // Soft contact shadow under the car
  const blob=new T.Mesh(new T.PlaneGeometry(2.6,5.4),new T.MeshBasicMaterial({map:glowTex,color:0x000000,transparent:true,opacity:.55,depthWrite:false}));
  blob.rotation.x=-Math.PI/2;blob.position.y=.065;car.add(blob);
  car.position.x=-1.8; // left lane

  // ---------- frame loop ----------
  let clusterTimer=0,lastK=-1,lastDD=-1,mode='chase',lastX=0,spin=0,pitch=0,pitchVel=0,time=0,camOffZ=6.4,fov=52;
  function resize(){const w=host.clientWidth,h=host.clientHeight;if(!w||!h)return;renderer.setSize(w,h,false);camera.aspect=w/h;camera.updateProjectionMatrix()}
  new ResizeObserver(resize).observe(host);resize();
  const look=new T.Vector3();
  function frame(dt,st){
   time+=dt;
   const dx=st.x-lastX;lastX=st.x;
   if(dx<0||dx>100)spin=0;else spin-=dx/.334;            // wheel turns exactly with distance travelled
   for(const s of spinners)s.rotation.x=spin;
   car.position.z=-st.x;
   const target=Math.max(-.03,Math.min(.02,st.a*.0045)); // nose lifts on acceleration, dips on braking
   pitchVel+=((target-pitch)*70-pitchVel*12)*dt;pitch+=pitchVel*dt;chassis.rotation.x=pitch;
   const rough=Math.min(1,st.v/12);chassis.position.y=(Math.sin(time*31)*.0012+Math.sin(time*17.3)*.0015)*rough;
   const braking=st.braking;tailMat.emissiveIntensity=braking?3.2:.3;for(const g of glows)g.material.opacity=braking?.85:0;
   updateScenery(st.x);
   if(mode==='cockpit'){clusterTimer-=dt;const k=Math.round(st.v*3.6),dd=Math.round(st.x*10);if(clusterTimer<=0&&(k!==lastK||dd!==lastDD)){drawCluster(st.v*3.6,st.x);lastK=k;lastDD=dd;clusterTimer=.08}}
   const cz=car.position.z,cx=car.position.x;
   hills.position.z=cz;sky.position.copy(camera.position);
   sun.position.set(cx+SUN_DIR.x*90,SUN_DIR.y*90,cz+SUN_DIR.z*90);sun.target.position.set(cx,0,cz-8);
   let wantFov;
   if(mode==='chase'){
    camOffZ+=((6.2+st.v*.06)-camOffZ)*Math.min(1,dt*3);
    camera.position.set(cx+1.0,2.3,cz+camOffZ);look.set(cx-.25,.85,cz-6);wantFov=50+st.v*.32;camera.near=.1;
   }else{
    const shake=Math.sin(time*29)*.0015*rough;
    camera.position.set(cx+.37,1.2+shake+pitch*.4,cz+.32);look.set(cx+.37,.55+pitch*4,cz-12);wantFov=56;camera.near=.04;
   }
   fov+=(wantFov-fov)*Math.min(1,dt*4);camera.fov=fov;camera.updateProjectionMatrix();camera.lookAt(look);
   renderer.render(scene,camera);
  }
  function setMode(m){mode=m;fov=m==='chase'?50:56}
  updateScenery(0);
  return {frame,setMode,get mode(){return mode}};
 }
 const view3d=createView3D($('windshield'));
 if(!view3d)$('windshield').classList.add('nogl');
 const CAMS=['chase','cockpit'];
 function setCam(m){if(!view3d)return;view3d.setMode(m);document.querySelectorAll('.camsel button').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.cam===m)))}
 document.querySelectorAll('.camsel button').forEach(b=>b.addEventListener('click',()=>setCam(b.dataset.cam)));

 function resizeCanvas(){
  const r=canvas.getBoundingClientRect(); dpr=Math.min(window.devicePixelRatio||1,2);
  canvas.width=Math.max(1,Math.round(r.width*dpr));canvas.height=Math.max(1,Math.round(r.height*dpr));
  ctx.setTransform(dpr,0,0,dpr,0,0); drawGraph();
 }
 // Points the student has fixed on the graph: Start, P1, P2 … and End (after "End journey")
 function nodes(){const n=[{t:0,x:0,name:'Start'}];state.marks.forEach((mk,i)=>n.push({t:mk.t,x:mk.x,name:'P'+(i+1)}));
  if(state.ended){const l=n[n.length-1];if(state.t-l.t>.05)n.push({t:state.t,x:state.x,name:'End'});else l.name+=' / End'}return n}
 // Is a stretch of the trip uniform? Look at the recorded speeds inside it.
 function motionKind(t0,t1,dx){if(dx<.05)return['At rest','r'];let lo=1e9,hi=-1e9;
  for(const p of state.points){if(p.t<t0-1e-6||p.t>t1+1e-6)continue;lo=Math.min(lo,p.v);hi=Math.max(hi,p.v)}
  return hi-lo<.35?['Uniform','u']:['Non-uniform','n']}
 function segments(){const n=nodes(),out=[];for(let i=1;i<n.length;i++){const a=n[i-1],b=n[i],dt=b.t-a.t,dx=b.x-a.x;if(dt<.05)continue;
  out.push({a,b,dt,dx,v:dx/dt,kind:motionKind(a.t,b.t,dx)})}return out}
 let gmap=null;
 function drawGraph(){
  const w=canvas.clientWidth,h=canvas.clientHeight;if(!w||!h)return;
  ctx.clearRect(0,0,w,h);ctx.fillStyle='#0e1923';ctx.fillRect(0,0,w,h);
  const m={l:48,r:15,t:17,b:37},pw=w-m.l-m.r,ph=h-m.t-m.b;
  const gT=state.ghost?state.ghost.t:0,gX=state.ghost?state.ghost.x:0;
  const tMax=Math.max(30,Math.ceil(Math.max(state.t,gT,1)/10)*10),xMax=Math.max(100,Math.ceil(Math.max(state.x,gX,1)/50)*50);
  $('graphRange').textContent=`0–${tMax} s · 0–${xMax} m`;
  const X=t=>m.l+(t/tMax)*pw,Y=x=>m.t+ph-(x/xMax)*ph;
  ctx.lineWidth=1;
  for(let i=0;i<=10;i++){
   const gx=m.l+pw*i/10,gy=m.t+ph*i/10;
   ctx.strokeStyle=i%2===0?'#294050':'#1a2a37';ctx.beginPath();ctx.moveTo(gx,m.t);ctx.lineTo(gx,m.t+ph);ctx.stroke();
   ctx.beginPath();ctx.moveTo(m.l,gy);ctx.lineTo(m.l+pw,gy);ctx.stroke();
  }
  ctx.fillStyle='#9aafbf';ctx.font='11px IBM Plex Sans,Roboto,sans-serif';ctx.textAlign='center';ctx.textBaseline='top';
  for(let i=0;i<=5;i++)ctx.fillText((tMax*i/5).toFixed(0),X(tMax*i/5),m.t+ph+8);
  ctx.textAlign='right';ctx.textBaseline='middle';
  for(let i=0;i<=5;i++)ctx.fillText((xMax*i/5).toFixed(0),m.l-8,Y(xMax*i/5));
  ctx.fillStyle='#b4c7d4';ctx.textAlign='center';ctx.textBaseline='alphabetic';ctx.fillText('Time (s)',m.l+pw/2,h-5);
  ctx.save();ctx.translate(13,m.t+ph/2);ctx.rotate(-Math.PI/2);ctx.fillText('Distance (m)',0,0);ctx.restore();
  const trace=(pts,style,width,dash)=>{if(pts.length<2)return;ctx.save();if(dash)ctx.setLineDash(dash);ctx.beginPath();ctx.moveTo(X(pts[0].t),Y(pts[0].x));
   for(let i=1;i<pts.length;i++)ctx.lineTo(X(pts[i].t),Y(pts[i].x));ctx.strokeStyle=style;ctx.lineWidth=width;ctx.lineJoin='round';ctx.stroke();ctx.restore()};
  if(state.ghost)trace(state.ghost.points,'#7d8f9c99',2,[6,5]);          // previous trip, for comparison
  trace(state.points,'#54d6e8',2.5);
  const segs=segments(),label=(txt,x,y,fg,bg,font)=>{ctx.font=font;const tw=ctx.measureText(txt).width;let lx=Math.min(Math.max(x-tw/2,m.l+2),m.l+pw-tw-6);
   ctx.fillStyle=bg;ctx.fillRect(lx-4,y-14,tw+8,19);ctx.fillStyle=fg;ctx.textAlign='left';ctx.textBaseline='alphabetic';ctx.fillText(txt,lx,y)};
  if(state.ended&&state.t>0&&segs.length>1){ // whole-trip average: start → end
   ctx.save();ctx.setLineDash([7,6]);ctx.strokeStyle='#c9e27a';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(X(0),Y(0));ctx.lineTo(X(state.t),Y(state.x));ctx.stroke();ctx.restore();
   label(`average ${(state.x/state.t).toFixed(1)} m/s`,X(state.t*.62)+44,Y(state.x*.62)+20,'#c9e27a','#0e1923d9','600 12px IBM Plex Sans,Roboto,sans-serif');
  }
  // straight dashed "chord" between consecutive points: its slope is the average speed over that stretch
  segs.forEach((sg,i)=>{const sel=i===state.sel,x1=X(sg.a.t),y1=Y(sg.a.x),x2=X(sg.b.t),y2=Y(sg.b.x);
   ctx.save();ctx.setLineDash(sel?[]:[5,5]);ctx.strokeStyle=sel?'#ffffff':'#ffbd69cc';ctx.lineWidth=sel?3:1.6;ctx.beginPath();ctx.moveTo(x1,y1);ctx.lineTo(x2,y2);ctx.stroke();ctx.restore();
   if(!sel&&Math.hypot(x2-x1,y2-y1)>46)label(`${sg.v.toFixed(1)} m/s`,(x1+x2)/2+18,(y1+y2)/2+4,'#ffd9a3','#0e1923d0','600 11px IBM Plex Sans,Roboto,sans-serif')});
  state.marks.forEach((mk,i)=>{ // marked points with guide lines to both axes
   const mx=X(mk.t),my=Y(mk.x);
   ctx.save();ctx.setLineDash([3,4]);ctx.strokeStyle='#ffbd6966';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(mx,my);ctx.lineTo(mx,m.t+ph);ctx.moveTo(mx,my);ctx.lineTo(m.l,my);ctx.stroke();ctx.restore();
   ctx.beginPath();ctx.arc(mx,my,6,0,Math.PI*2);ctx.fillStyle='#ffbd69';ctx.fill();ctx.lineWidth=2;ctx.strokeStyle='#0e1923';ctx.stroke();
   const lbl=`P${i+1} (${mk.t.toFixed(1)} s, ${mk.x.toFixed(1)} m)`;ctx.font='600 11px IBM Plex Sans,Roboto,sans-serif';const tw=ctx.measureText(lbl).width;
   let lx=mx-tw-14,ly=my-9;if(lx<m.l+4)lx=mx+9;if(ly-14<m.t)ly=my+22;
   ctx.fillStyle='#0e1923e6';ctx.fillRect(lx-3,ly-13,tw+8,17);ctx.fillStyle='#ffd9a3';ctx.textAlign='left';ctx.textBaseline='alphabetic';ctx.fillText(lbl,lx+1,ly);
  });
  const sg=segs[state.sel];
  if(sg){const x1=X(sg.a.t),y1=Y(sg.a.x),x2=X(sg.b.t),y2=Y(sg.b.x),cx=(x1+x2)/2,cy=(y1+y2)/2;
   for(const [px,py] of [[x1,y1],[x2,y2]]){ctx.beginPath();ctx.arc(px,py,8,0,7);ctx.strokeStyle='#fff';ctx.lineWidth=2;ctx.stroke()}
   const l1=`${sg.a.name} → ${sg.b.name}`,l2=`${sg.dx.toFixed(1)} m ÷ ${sg.dt.toFixed(1)} s = ${sg.v.toFixed(2)} m/s`,l3=`= ${(sg.v*3.6).toFixed(1)} km/h · ${sg.kind[0]}`;
   ctx.font='700 13px IBM Plex Sans,Roboto,sans-serif';const bw=Math.max(ctx.measureText(l2).width,ctx.measureText(l3).width)+22,bh=62;
   let bx=Math.min(Math.max(cx+14,m.l+4),m.l+pw-bw-4),by=Math.min(Math.max(cy-bh-12,m.t+4),m.t+ph-bh-4);
   ctx.fillStyle='#0b141bf2';ctx.strokeStyle='#ffffff';ctx.lineWidth=1.5;ctx.beginPath();ctx.rect(bx,by,bw,bh);ctx.fill();ctx.stroke();
   ctx.textAlign='left';ctx.textBaseline='alphabetic';ctx.fillStyle='#ffbd69';ctx.font='700 12px IBM Plex Sans,Roboto,sans-serif';ctx.fillText(l1,bx+11,by+18);
   ctx.fillStyle='#ffffff';ctx.font='700 13px IBM Plex Sans,Roboto,sans-serif';ctx.fillText(l2,bx+11,by+37);ctx.fillStyle='#b9cad5';ctx.font='600 12px IBM Plex Sans,Roboto,sans-serif';ctx.fillText(l3,bx+11,by+54)}
  const px=X(state.t),py=Y(state.x);
  ctx.beginPath();ctx.arc(px,py,7,0,Math.PI*2);ctx.fillStyle='#54d6e8';ctx.fill();
  ctx.beginPath();ctx.arc(px,py,12,0,Math.PI*2);ctx.strokeStyle='#54d6e844';ctx.lineWidth=2;ctx.stroke();
  gmap={X,Y,segs};
 }
 // Tap near a dashed segment to select it
 canvas.addEventListener('click',e=>{if(!gmap)return;const r=canvas.getBoundingClientRect(),qx=e.clientX-r.left,qy=e.clientY-r.top;let best=-1,bd=16;
  gmap.segs.forEach((sg,i)=>{const x1=gmap.X(sg.a.t),y1=gmap.Y(sg.a.x),x2=gmap.X(sg.b.t),y2=gmap.Y(sg.b.x),dx=x2-x1,dy=y2-y1,L=dx*dx+dy*dy||1;
   const u=Math.max(0,Math.min(1,((qx-x1)*dx+(qy-y1)*dy)/L)),d=Math.hypot(qx-(x1+u*dx),qy-(y1+u*dy));if(d<bd){bd=d;best=i}});
  state.sel=best===state.sel?-1:best;
  const sg=gmap.segs[state.sel];$('markToast').textContent=sg?`${sg.a.name} → ${sg.b.name}: ${sg.v.toFixed(2)} m/s`:'';drawGraph()});
 function motionText(){if(state.v<.05&&Math.abs(state.a)<.05)return'At rest';if(state.a>.05)return'Speeding up';if(state.a<-.05)return'Slowing down';return'Steady speed'}
 function renderTable(){const n=nodes();if(!state.ended&&state.t>0)n.push({t:state.t,x:state.x,name:'Now'});
  let html='<table><tr><th>Point</th><th>Time (s)</th><th>Distance (m)</th><th>Speed since last (m/s)</th></tr>';
  n.forEach((p,i)=>{const q=n[i-1],v=q&&p.t-q.t>.05?((p.x-q.x)/(p.t-q.t)).toFixed(2):'—';html+=`<tr><td>${p.name}</td><td>${p.t.toFixed(1)}</td><td>${p.x.toFixed(1)}</td><td>${v}</td></tr>`});
  $('ptable').innerHTML=html+'</table>'}
 let lastTableT=-1;
 function updateUI(){
  const kmh=state.v*3.6;
  $('speed').textContent=kmh.toFixed(0);$('distance').textContent=state.x.toFixed(1);
  $('time').textContent=state.t.toFixed(1);$('motion').textContent=motionText();$('speedMs').textContent=state.v.toFixed(2);
  $('speedConv').textContent=`× 18/5 = ${kmh.toFixed(1)} km/h`;
  // Gauge: 270° arc centred at (27,29), radius 20, sweeping clockwise from 135° (bottom-left) to 45° (bottom-right)
  const frac=Math.min(1,state.v/MAX_SPEED),sweep=frac*270,rad=(135+sweep)*Math.PI/180,cx=27,cy=29,r=20;
  const sx=(cx+r*Math.cos(rad)).toFixed(2),sy=(cy+r*Math.sin(rad)).toFixed(2);
  $('speedArc').setAttribute('d',`M 12.86 43.14 A 20 20 0 ${sweep>180?1:0} 1 ${sx} ${sy}`);
  const pp=state.running?'Ⅱ|Pause':state.t>0?'▶|Resume':'▶|Start';if($('playPause').dataset.s!==pp){$('playPause').dataset.s=pp;const [ic,lb]=pp.split('|');$('playPause').innerHTML=`<span class="ic">${ic}</span><span class="lb">${lb}</span>`}
  $('status').textContent=state.running?'● SIMULATION RUNNING':state.v>0?'● CAR MOVING':'● READY TO DRIVE';
  $('sceneLabel').textContent=state.v>0.1?'MOVING · '+kmh.toFixed(0)+' KM/H'+(state.cruise?' · CRUISE':''):'CAR STATIONARY';
  $('windshield').classList.toggle('driving',state.running&&state.v>0.5);
  $('endJourney').disabled=state.t<=0;$('undo').disabled=!state.marks.length;
  $('cruise').setAttribute('aria-pressed',String(state.cruise));$('cruiseState').textContent=state.cruise?'Cruise on':'Cruise off';
  if($('ptable').classList.contains('open')&&Math.abs(state.t-lastTableT)>.09){lastTableT=state.t;renderTable()}
  drawGraph();
 }
 function tick(now){
  if(!state.last)state.last=now;
  const dt=Math.min((now-state.last)/1000,.05);state.last=now;
  if(state.running&&dt>0){
   let a;
   if(state.braking){a=-BRAKE;state.cruise=false}             // braking cancels cruise, as in a real car
   else if(state.throttle)a=ACCEL;
   else if(state.cruise)a=0;                                   // cruise: engine just balances friction
   else a=-(COAST0+COAST1*state.v);                            // pedals released: friction slows the car
   const oldV=state.v;
   state.v=Math.max(0,Math.min(MAX_SPEED,state.v+a*dt));
   state.a=(state.v-oldV)/dt;                                  // actual change of speed (0 when stopped or at top speed)
   state.x+=(oldV+state.v)*.5*dt;                              // distance from average speed over the step
   state.t+=dt;
   const last=state.points[state.points.length-1];
   if(state.t-last.t>=.08||state.points.length===1)state.points.push({t:state.t,x:state.x,v:state.v});
   if(state.points.length>25000)state.points.shift();
  }else state.a=0;
  updateUI();
  if(view3d)view3d.frame(dt,state);
  requestAnimationFrame(tick);
 }
 function setPedal(which,pressed){
  if(which==='throttle'){state.throttle=pressed;$('accelerator').classList.toggle('active',pressed)}
  else{state.braking=pressed;$('brake').classList.toggle('active',pressed)}
  if(pressed){state.ended=false;state.sel=-1;closeCard()}
  if(pressed&&!state.running){state.running=true;state.last=performance.now()}
 }
 function bindPedal(id,which){
  const el=$(id);
  el.addEventListener('pointerdown',e=>{e.preventDefault();try{el.setPointerCapture(e.pointerId)}catch(_){}setPedal(which,true)});
  const release=()=>setPedal(which,false);
  ['pointerup','pointercancel','lostpointercapture','pointerleave'].forEach(ev=>el.addEventListener(ev,release));
  el.addEventListener('contextmenu',e=>e.preventDefault());
 }
 bindPedal('accelerator','throttle');bindPedal('brake','brake');
 function toggleCruise(){state.cruise=!state.cruise;updateUI()}
 $('cruise').addEventListener('click',toggleCruise);
 $('playPause').addEventListener('click',()=>{state.running=!state.running;state.last=performance.now();updateUI()});
 $('reset').addEventListener('click',()=>{
  if(state.t>1)state.ghost={points:state.points.slice(),t:state.t,x:state.x};   // keep this trip faintly for comparison
  $('ghostLegend').hidden=!state.ghost;
  state.t=0;state.x=0;state.v=0;state.a=0;state.running=false;state.throttle=false;state.braking=false;state.cruise=false;
  state.points=[{t:0,x:0,v:0}];state.marks=[];state.ended=false;state.sel=-1;closeCard();$('markToast').textContent='';
  $('accelerator').classList.remove('active');$('brake').classList.remove('active');state.last=performance.now();renderTable();updateUI()});
 function markPoint(){
  const lastMk=state.marks[state.marks.length-1];
  if(state.t<=0){$('markToast').textContent='Start driving first';return}
  if(lastMk&&Math.abs(lastMk.t-state.t)<.05){$('markToast').textContent='Point already marked here';return}
  state.marks.push({t:state.t,x:state.x});state.sel=-1;
  const n=nodes(),a=n[n.length-2],b=n[n.length-1],v=(b.x-a.x)/Math.max(b.t-a.t,1e-9);
  $('markToast').textContent=`P${state.marks.length} · ${state.t.toFixed(1)} s, ${state.x.toFixed(1)} m · ${a.name}→${b.name}: ${v.toFixed(2)} m/s`;renderTable();drawGraph()}
 $('mark').addEventListener('click',markPoint);
 function undoMark(){if(!state.marks.length)return;state.marks.pop();state.sel=-1;$('markToast').textContent='Last point removed';renderTable();updateUI()}
 $('undo').addEventListener('click',undoMark);
 $('tableBtn').addEventListener('click',()=>{const o=$('ptable').classList.toggle('open');$('tableBtn').setAttribute('aria-pressed',String(o));renderTable()});
 function toggleFS(){const d=document;if(!d.fullscreenElement){(d.documentElement.requestFullscreen||d.documentElement.webkitRequestFullscreen||(()=>{})).call(d.documentElement)}else{(d.exitFullscreen||d.webkitExitFullscreen).call(d)}}
 $('fullscreen').addEventListener('click',toggleFS);
 document.addEventListener('fullscreenchange',()=>{$('fullscreen').textContent=document.fullscreenElement?'⤡ Exit full screen':'⛶ Full screen'});
 function closeCard(){$('endModal').classList.remove('open')}
 function endJourney(){
  if(state.t<=0)return;
  setPedal('throttle',false);setPedal('brake',false);state.running=false;state.ended=true;state.cruise=false;state.sel=-1;
  const avg=state.x/state.t;
  $('tripDist').textContent=state.x.toFixed(1);$('tripTime').textContent=state.t.toFixed(1);
  $('tripAvg').textContent=avg.toFixed(2);$('tripKmh').textContent=`× 18/5 = ${(avg*3.6).toFixed(1)} km/h`;
  $('tripFormula').textContent=`Average speed = total distance ÷ total time = ${state.x.toFixed(1)} m ÷ ${state.t.toFixed(1)} s = ${avg.toFixed(2)} m/s`;
  const segs=segments();
  let rows='<tr><th>Part of trip</th><th>Distance</th><th>Time</th><th>Speed</th><th>Motion</th></tr>';
  segs.forEach(sg=>{rows+=`<tr><td>${sg.a.name} → ${sg.b.name}</td><td>${sg.dx.toFixed(1)} m</td><td>${sg.dt.toFixed(1)} s</td><td>${sg.v.toFixed(2)} m/s</td><td><span class="tag ${sg.kind[1]}">${sg.kind[0]}</span></td></tr>`});
  const sx=segs.reduce((a,b)=>a+b.dx,0),st=segs.reduce((a,b)=>a+b.dt,0);
  rows+=`<tr class="total"><td>Whole trip (add them up)</td><td>${sx.toFixed(1)} m</td><td>${st.toFixed(1)} s</td><td>${(sx/st).toFixed(2)} m/s</td><td></td></tr>`;
  $('segTable').innerHTML=rows;
  const simple=segs.reduce((a,b)=>a+b.v,0)/Math.max(1,segs.length);
  $('segBlock').hidden=segs.length<2;
  if(segs.length>=2){
   const same=Math.abs(simple-avg)<.05;
   const bar='<div class="tbar">'+segs.map(x=>{const pct=x.dt/st*100;return `<div class="${x.kind[1]}" style="flex:${x.dt} 0 0" title="${x.a.name}→${x.b.name}: ${x.dt.toFixed(1)} s">${pct>12?x.a.name+'→'+x.b.name:''}</div>`}).join('')+'</div><div class="tcap">Share of the trip\'s time spent in each part (wider = longer)</div>';
   // the part to point at: a stopped part if it was short, otherwise the shortest part
   const fair=st/segs.length,rest=segs.filter(x=>x.kind[1]==='r'&&x.dt<fair).sort((a,b)=>a.dt-b.dt)[0],short=rest||segs.reduce((a,b)=>b.dt<a.dt?b:a);
   const frac={2:'half',3:'third',4:'quarter',5:'fifth',6:'sixth',7:'seventh',8:'eighth',9:'ninth',10:'tenth'}[segs.length]||`1/${segs.length}`;
   const who=rest?`It was stopped for only ${short.dt.toFixed(1)} s`:`${short.a.name} → ${short.b.name} lasted only ${short.dt.toFixed(1)} s`;
   $('whyBox').innerHTML=same
    ?`<b>Can we just average the speeds?</b> Here it gives nearly the same answer (${simple.toFixed(2)} m/s) — just luck. The parts took different times, so this shortcut can't be trusted.<br>✅ Always use: <b>total distance ÷ total time = ${avg.toFixed(2)} m/s</b>${bar}`
    :`<b>Can we just average the speeds? ❌ No.</b><br>(${segs.map(x=>x.v.toFixed(2)).join(' + ')}) ÷ ${segs.length} = <s>${simple.toFixed(2)} m/s</s> — wrong!<br>The car did not spend equal time in each part. ${who}, but this method counts it as one full ${frac} of the trip.<br>✅ Always use: <b>total distance ÷ total time = ${avg.toFixed(2)} m/s</b>${bar}`;
  }
  renderTable();updateUI();$('endModal').classList.add('open');$('closeCard').focus();
 }
 $('endJourney').addEventListener('click',endJourney);
 $('closeCard').addEventListener('click',closeCard);
 $('newJourney').addEventListener('click',()=>{$('reset').click()});
 $('endModal').addEventListener('click',e=>{if(e.target===$('endModal'))closeCard()});
 window.addEventListener('keydown',e=>{
  if(e.key==='Escape'){closeCard();return}
  if($('endModal').classList.contains('open'))return;
  if(['ArrowUp','ArrowDown',' '].includes(e.key))e.preventDefault();
  if(e.key==='ArrowUp')setPedal('throttle',true);
  if(e.key==='ArrowDown')setPedal('brake',true);
  if(e.key===' '&&!e.repeat){state.running=!state.running;state.last=performance.now();updateUI()}
  if(e.repeat)return;
  const k=e.key.toLowerCase();
  if(k==='c'&&view3d)setCam(CAMS[(CAMS.indexOf(view3d.mode)+1)%CAMS.length]);
  if(k==='k')toggleCruise();if(k==='m')markPoint();if(k==='u')undoMark();if(k==='f')toggleFS();
 });
 window.addEventListener('keyup',e=>{if(e.key==='ArrowUp')setPedal('throttle',false);if(e.key==='ArrowDown')setPedal('brake',false)});
 window.addEventListener('blur',()=>{setPedal('throttle',false);setPedal('brake',false)});
 // Initial render; resize observer keeps graph crisp on phones and desktops.
 new ResizeObserver(resizeCanvas).observe(canvas);resizeCanvas();updateUI();requestAnimationFrame(tick);
})();
