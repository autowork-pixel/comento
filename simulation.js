/* Deterministic teaching scenario, not a prediction of actual Naver Ads results. */
(function(root){
 function clamp(x,a,b){return Math.max(a,Math.min(b,x))}
 function simulatePowerlink(group,options={}){
  const days=clamp(Number(options.days)||7,1,31),budget=Math.max(0,Number(options.budget)||1000000);
  const monthlySearch=Math.max(0,Number(options.monthlySearch)||0),baseCtr=clamp(Number(options.baseCtr)||0.035,0,1),baseCvr=clamp(Number(options.baseCvr)||0.018,0,1);
  const keywords=(group.keywords||[]).filter(x=>x.enabled!==false),ads=(group.creatives||[]).filter(x=>x.enabled!==false),extensions=(group.extensions||[]).filter(x=>x.enabled!==false);
  if(!keywords.length||!ads.length)throw Error('키워드와 소재를 각각 하나 이상 등록해 주세요.');
  if(!monthlySearch)throw Error('월간 검색량 가정값 또는 API 검색량이 필요합니다.');
  const titles=ads.flatMap(a=>a.titles?.length?a.titles:[a.title]).filter(Boolean),descriptions=ads.flatMap(a=>a.descriptions?.length?a.descriptions:[a.description]).filter(Boolean);
  const normalized=s=>String(s||'').replace(/\s+/g,'').toLowerCase();
  const relevance=keywords.reduce((sum,k)=>sum+(titles.some(t=>normalized(t).includes(normalized(k.name)))?1:descriptions.some(t=>normalized(t).includes(normalized(k.name)))?0.65:0.25),0)/keywords.length;
  const validDescriptions=descriptions.filter(x=>x.length>=20&&x.length<=45).length/Math.max(1,descriptions.length);
  const extensionFactor=1+Math.min(extensions.length,4)*0.04;
  const ctr=clamp(baseCtr*(0.7+0.5*relevance)*(0.9+0.1*validDescriptions)*extensionFactor,0.001,0.25);
  const bid=keywords.reduce((sum,k)=>sum+(Number(k.bid)||Number(group.bid)||70),0)/keywords.length;
  const visibility=clamp(bid/(Number(options.referenceBid)||1000),0.1,1);
  const eligibleSearches=monthlySearch*days/30,impressions=Math.floor(eligibleSearches*visibility);
  const potentialClicks=Math.floor(impressions*ctr),cpc=Math.max(70,Math.round(bid*0.72/10)*10);
  const spendCap=Math.min(budget,group.unlimited?budget:Math.max(0,Number(group.budget)||0)*days);
  const clicks=Math.min(potentialClicks,Math.floor(spendCap/cpc)),spend=clicks*cpc;
  const conversions=Math.round(clicks*baseCvr),revenue=conversions*Math.max(0,Number(options.orderValue)||0);
  return {days,budget,monthlySearch,keywords:keywords.length,ads:ads.length,extensions:extensions.length,relevance:+relevance.toFixed(3),visibility:+visibility.toFixed(3),ctr:+ctr.toFixed(4),cvr:baseCvr,cpc,impressions,clicks,spend,unspent:budget-spend,conversions,revenue,roas:spend?+(revenue/spend*100).toFixed(1):0,assumptions:{referenceBid:Number(options.referenceBid)||1000,baseCtr,baseCvr,orderValue:Number(options.orderValue)||0,monthlySearchSource:options.monthlySearchSource||'수동 가정'}};
 }
 root.simulatePowerlink=simulatePowerlink;
 if(typeof module!=='undefined')module.exports={simulatePowerlink};
})(typeof window!=='undefined'?window:globalThis);

