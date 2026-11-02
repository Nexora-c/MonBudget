'use strict';
(function(global){
  const money = n => new Intl.NumberFormat('fr-MA',{minimumFractionDigits:2,maximumFractionDigits:2}).format(Number.isFinite(n)?n:0)+' MAD';
  const essentialPattern = /factur|logement|sant[eé]|aliment|transport|assur|imp[oô]t|education|[eé]lectricit[eé]|eau|loyer/i;
  const optionalPattern = /loisir|shopping|restaurant|sortie|abonnement|divert|cadeau/i;

  function currentMonthKey(now){
    const d = now instanceof Date ? now : new Date();
    return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0');
  }

  function previousMonthKey(month,offset=1){
    const d = new Date(Number(month.slice(0,4)),Number(month.slice(5,7))-1-offset,1);
    return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0');
  }

  function validMonth(month){
    return typeof month==='string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(month);
  }

  function snapshot(data,month,now=new Date()){
    const safe=data&&typeof data==='object'?data:{};
    const transactions=Array.isArray(safe.transactions)?safe.transactions:[];
    const recurring=Array.isArray(safe.recurring)?safe.recurring:[];
    const savings=safe.savings&&typeof safe.savings==='object'?safe.savings:{};
    const budgets=safe.budgets&&typeof safe.budgets==='object'?safe.budgets:{};
    if(!validMonth(month))throw new Error('Mois invalide');

    const tx=transactions.filter(t=>t&&typeof t.date==='string'&&t.date.startsWith(month));
    const income=tx.filter(t=>t.type==='income').reduce((a,t)=>a+(Number(t.amount)||0),0);
    const expenses=tx.filter(t=>t.type==='expense').reduce((a,t)=>a+(Number(t.amount)||0),0);
    const categories=new Map();
    for(const t of tx.filter(t=>t.type==='expense')){
      const key=typeof t.category==='string'&&t.category.trim()?t.category:'Autre';
      categories.set(key,(categories.get(key)||0)+(Number(t.amount)||0));
    }

    const active=recurring.filter(r=>r&&r.active);
    const current=currentMonthKey(now);
    const historicalUnknown=month<current?active.filter(r=>!tx.some(t=>t.type==='expense'&&t.recurringId===r.id)).length:0;
    const outstanding=month<current?[]:active.filter(r=>!tx.some(t=>t.type==='expense'&&t.recurringId===r.id));
    const manualCandidates=outstanding.map(r=>({
      name:r.name,
      amount:Number(r.amount)||0,
      candidates:tx.filter(t=>t.type==='expense'&&!t.recurringId&&Math.abs((Number(t.amount)||0)-(Number(r.amount)||0))<0.01&&(
        t.category===r.category||
        (typeof t.description==='string'&&typeof r.name==='string'&&t.description.toLocaleLowerCase('fr').includes(r.name.toLocaleLowerCase('fr')))
      ))
    })).filter(v=>v.candidates.length);

    const unpaid=outstanding.reduce((a,r)=>a+(Number(r.amount)||0),0);
    const saved=Number(savings[month]?.saved)||0;
    const limit=Number.isFinite(budgets[month])?budgets[month]:undefined;
    return {
      month,
      income,
      expenses,
      net:income-expenses,
      savings:saved,
      available:income-expenses-saved,
      unpaid,
      limit,
      categories:[...categories.entries()].sort((a,b)=>b[1]-a[1]),
      outstanding,
      manualCandidates,
      historicalUnknown,
      txCount:tx.length
    };
  }

  function advancedAnalysis(data,x,now=new Date()){
    const previous=snapshot(data,previousMonthKey(x.month),now);
    const changes=x.categories.map(([cat,amount])=>{
      const prev=previous.categories.find(([k])=>k===cat)?.[1]||0;
      return {cat,amount,prev,delta:amount-prev,essential:essentialPattern.test(cat)};
    }).sort((a,b)=>b.delta-a.delta);
    const optional=changes.filter(c=>c.delta>0&&!c.essential);
    const monthComparison=previous.txCount
      ? 'Mois précédent : '+money(previous.expenses)+' de dépenses. Écart enregistré : '+(x.expenses>=previous.expenses?'+':'−')+money(Math.abs(x.expenses-previous.expenses))+'. Cette comparaison peut être incomplète.'
      : 'Pas assez de données du mois précédent pour une comparaison fiable.';
    const example=optional[0];
    const savingsTip=example
      ? 'Piste facultative à examiner : '+example.cat+' ('+money(example.amount)+' ce mois-ci, contre '+money(example.prev)+' précédemment). Une baisse de 10 % représenterait '+money(example.amount*0.1)+' ; c’est un exemple, pas une économie garantie.'
      : 'Aucune hausse clairement facultative détectée. Évite de réduire automatiquement les dépenses essentielles.';
    const warnings=changes.filter(c=>c.delta>0&&c.prev>0&&c.delta/c.prev>=0.3).slice(0,3);
    return {previous,monthComparison,savingsTip,warnings};
  }

  function monthlyPlan(x){
    const nominal=x.available-x.unpaid;
    const essentials=x.categories.filter(([cat])=>essentialPattern.test(cat)).reduce((a,[,v])=>a+v,0);
    const optional=x.expenses-essentials;
    const reserveIllustrative=Math.max(0,Math.round(x.income*0.1));
    const indicative=nominal-reserveIllustrative;
    return {nominal,essentials,optional,reserveIllustrative,indicative};
  }

  function forecastRemaining(data,x,now=new Date()){
    const current=currentMonthKey(now);
    if(x.month!==current)return {ok:false,reason:'Prévision disponible uniquement pour le mois en cours.'};
    const lastDay=new Date(Number(x.month.slice(0,4)),Number(x.month.slice(5,7)),0).getDate();
    const day=Math.min(now.getDate(),lastDay);
    const daysRemaining=Math.max(0,lastDay-day);
    if(daysRemaining===0)return {ok:false,reason:'Le mois est terminé.'};

    const hist=[];
    for(let offset=1;offset<=3;offset++){
      const snap=snapshot(data,previousMonthKey(x.month,offset),now);
      if(snap.txCount>0&&snap.categories.length>0)hist.push(snap);
    }
    if(hist.length<2)return {ok:false,reason:'Historique insuffisant : au moins deux mois précédents avec des dépenses sont nécessaires.'};

    const variablePast=hist.map(m=>m.categories.filter(([cat])=>!essentialPattern.test(cat)).reduce((a,[,v])=>a+v,0));
    const monthlyAverage=variablePast.reduce((a,b)=>a+b,0)/variablePast.length;
    const projectedVariable=Math.round(monthlyAverage*daysRemaining/lastDay);
    const reserve=Math.round(Math.max(0,x.income)*0.1);
    const after=x.available-x.unpaid-projectedVariable-reserve;
    return {ok:true,daysRemaining,months:hist.length,projectedVariable,reserve,after};
  }

  function alerts(data,month,now=new Date()){
    const x=snapshot(data,month,now);
    const list=[];
    if(x.txCount===0)list.push({level:'info',text:'Aucune opération enregistrée pour '+month+'.'});
    if(x.available<0)list.push({level:'danger',text:'Le solde mensuel après épargne est négatif de '+money(-x.available)+'.'});
    if(x.limit!==undefined&&x.expenses>x.limit)list.push({level:'danger',text:'Le plafond mensuel est dépassé de '+money(x.expenses-x.limit)+'.'});
    if(x.unpaid>0)list.push({level:'warning',text:'Charges actives sans paiement lié : '+money(x.unpaid)+'.'});
    if(x.manualCandidates.length)list.push({level:'warning',text:x.manualCandidates.length+' charge(s) ont une opération manuelle ressemblante : vérification recommandée avant de les considérer comme dues.'});
    if(x.historicalUnknown)list.push({level:'info',text:x.historicalUnknown+' charge(s) ont un statut historique inconnu, car leur date de début n’existe pas dans les anciennes données.'});
    const adv=advancedAnalysis(data,x,now);
    if(adv.warnings.length)list.push({level:'warning',text:'Hausse notable détectée : '+adv.warnings.map(v=>v.cat+' +'+money(v.delta)).join(', ')+'.'});
    if(!list.length)list.push({level:'ok',text:'Aucune alerte déterministe détectée pour ce mois. Les dépenses futures restent inconnues.'});
    return list.slice(0,4);
  }

  function classifyQuestion(q){
    const t=String(q||'').toLocaleLowerCase('fr').normalize('NFD').replace(/[\u0300-\u036f]/g,'');
    if(/compar|evolut|difference|versus|vs\b/.test(t))return 'comparaison';
    if(/que (dois|devrais)[ -]?je faire (ensuite|maintenant)|quoi faire (ensuite|maintenant)|prochaine etape|par quoi commencer|et maintenant|et ensuite/.test(t))return 'prochaine_etape';
    if(/pourquoi|explique|comment ca|plus de detail|precise|que faire ensuite/.test(t))return 'suivi';
    if(/mieux gerer|gerer mon budget|gestion de mon budget|comment gerer|ameliorer mon budget|recommand|que (me )?conseill/.test(t))return 'conseils';
    if(/bilan|synthese|resume|situation financiere|analyse (de |du |mon )?mois/.test(t))return 'bilan';
    if(/charge|loyer|facture|abonnement|fixe/.test(t))return 'charges';
    if(/par jour|quotidien|chaque jour|journalier/.test(t))return 'seuil';
    if(/plan|organis|finir le mois|gerer mon mois|strategie/.test(t))return 'plan';
    if(/econom|redui|amelior|depense.*trop/.test(t))return 'economies';
    if(/achat|acheter|permettre|prix|raisonnable/.test(t))return 'achat';
    if(/disponible|reste|fin de mois|prevision|solde|depenser|budget/.test(t))return 'disponible';
    return 'autre';
  }

  function answer(data,month,question,now=new Date()){
    const x=snapshot(data,month,now);
    const kind=classifyQuestion(question);
    const caveat=' Analyse basée uniquement sur les opérations de '+x.month+' ; ce n’est pas un solde bancaire cumulatif.';
    const uncertain=(x.historicalUnknown?' '+x.historicalUnknown+' charge(s) ont un statut historique inconnu.':'')+
      (x.manualCandidates.length?' '+x.manualCandidates.length+' charge(s) ont des opérations manuelles ressemblantes à vérifier.':'');
    const adv=()=>advancedAnalysis(data,x,now);
    const plan=()=>monthlyPlan(x);

    switch(kind){
      case 'prochaine_etape':
        return 'À faire ensuite : 1) vérifie les charges récurrentes et factures qui restent à payer ; 2) confirme que les '+money(x.savings)+' d’épargne réservée sont réellement mis de côté ; 3) garde une marge pour les besoins essentiels et les imprévus avant un achat facultatif. Le montant après épargne est '+money(x.available)+', mais les dépenses futures restent inconnues.'+uncertain+caveat;
      case 'suivi':
        return 'Le montant après épargne ('+money(x.available)+') correspond à revenus '+money(x.income)+' − dépenses '+money(x.expenses)+' − épargne réservée '+money(x.savings)+'. Vérifie en priorité les charges encore dues ('+money(x.unpaid)+') et les achats essentiels futurs.'+uncertain+caveat;
      case 'conseils':{
        const optional=x.categories.filter(([cat])=>!essentialPattern.test(cat));
        const p=plan();
        const risk=x.available<0?'Le solde mensuel après épargne est négatif.':x.manualCandidates.length?'Certains paiements manuels ressemblent à des charges fixes : vérifie-les.':x.unpaid>0?'Des charges restent sans paiement lié : '+money(x.unpaid)+'.':'Aucune charge récurrente non payée n’est détectée, mais des dépenses futures peuvent manquer.';
        const action=optional.length?'Examine d’abord les dépenses potentiellement facultatives de '+optional[0][0]+' ('+money(optional[0][1])+').':'Aucune dépense facultative n’est clairement identifiée.';
        return 'Bilan : revenus '+money(x.income)+', dépenses '+money(x.expenses)+', épargne réservée '+money(x.savings)+', montant après épargne '+money(x.available)+'. Risque à surveiller : '+risk+' Action : '+action+' Le repère de précaution de 10 % des revenus ('+money(p.reserveIllustrative)+') est illustratif, pas une somme déjà réservée.'+uncertain+caveat;
      }
      case 'comparaison':{
        const a=adv();
        return 'Comparaison avec '+previousMonthKey(x.month)+' : '+a.monthComparison+' '+a.savingsTip+caveat;
      }
      case 'bilan':
        return 'Bilan '+x.month+' : revenus '+money(x.income)+', dépenses '+money(x.expenses)+', solde mensuel '+money(x.net)+', épargne réservée '+money(x.savings)+', montant après épargne '+money(x.available)+'. '+(x.limit===undefined?'Aucun plafond mensuel enregistré.':x.expenses>x.limit?'Plafond dépassé de '+money(x.expenses-x.limit)+'.':'Plafond mensuel respecté.')+' Charges actives sans paiement lié : '+money(x.unpaid)+'. '+(x.categories.length?'Plus gros poste : '+x.categories[0][0]+' ('+money(x.categories[0][1])+'). ':'')+'Les dépenses futures non enregistrées restent inconnues.'+uncertain+caveat;
      case 'charges':
        return 'Charges actives sans paiement lié : '+money(x.unpaid)+'. '+(x.outstanding.length?'Détail : '+x.outstanding.slice(0,8).map(r=>r.name+' ('+money(Number(r.amount)||0)+')').join(', ')+'.':'Aucune charge active non réglée n’est détectée.')+' Les paiements manuels ressemblants restent à vérifier ; ils ne sont jamais attribués automatiquement.'+uncertain+caveat;
      case 'economies':{
        const a=adv();
        return 'Dépenses enregistrées : '+money(x.expenses)+'. '+a.monthComparison+' '+a.savingsTip+(x.limit===undefined?' Aucun plafond mensuel n’est défini.':x.expenses>x.limit?' Plafond dépassé de '+money(x.expenses-x.limit)+'.':' Plafond respecté.')+caveat;
      }
      case 'plan':{
        const p=plan();
        return 'Plan prudent : revenus '+money(x.income)+', dépenses déjà enregistrées '+money(x.expenses)+', épargne réservée '+money(x.savings)+', charges actives sans paiement lié '+money(x.unpaid)+'. Solde indicatif après ces éléments : '+money(p.nominal)+'. Repère de précaution de 10 % : '+money(p.reserveIllustrative)+'. Marge théorique après ce repère : '+money(p.indicative)+'. Ce montant n’est pas un budget disponible garanti.'+uncertain+caveat;
      }
      case 'achat':
        return 'Pour évaluer un achat, il manque son montant et les dépenses futures prévues. Le montant après épargne est '+money(x.available)+', avec '+money(x.unpaid)+' de charges récurrentes possiblement encore dues. Je ne peux donc pas conclure que l’achat est sûr.'+uncertain+caveat;
      case 'seuil':{
        const f=forecastRemaining(data,x,now);
        return f.ok?'Enveloppe quotidienne théorique : '+money(Math.max(0,f.after)/f.daysRemaining)+' sur '+f.daysRemaining+' jours, après une estimation partielle des dépenses variables futures et un repère de précaution. Ce n’est pas une autorisation de dépenser.'+caveat:'Je ne peux pas donner d’enveloppe quotidienne fiable : '+f.reason+caveat;
      }
      case 'disponible':
        return 'Pour '+x.month+' : '+money(x.income)+' de revenus − '+money(x.expenses)+' de dépenses − '+money(x.savings)+' d’épargne réservée = '+money(x.available)+'. Les '+money(x.unpaid)+' de charges sans paiement lié sont suivies séparément.'+uncertain+caveat;
      default:
        return 'Je peux analyser '+x.month+' en lecture seule. Demande un bilan, le montant disponible, des pistes d’économies, les charges restantes, une comparaison mensuelle ou ce qu’il faut faire ensuite. Mes réponses sont calculées localement par des règles déterministes.';
    }
  }

  global.MBDCopilot=Object.freeze({
    snapshot,
    alerts,
    answer,
    classifyQuestion,
    previousMonthKey,
    forecastRemaining,
    monthlyPlan,
    money
  });
})(globalThis);
