/* Heirloom content. Every prompt here was written by hand for this app.
   P(pack, tags, label, text) -> { id, pack, tags, label, text }
   tags feed the biography boost: once a subject shows up in the archive the
   engine leans toward prompts that share it. */

const Content = (() => {
  const PROMPTS = [];
  const seen = new Set();
  function P(pack, tags, label, text) {
    const id = pack.slice(0, 2) + String(PROMPTS.length + 1).padStart(3, '0');
    if (seen.has(text)) throw new Error('duplicate prompt: ' + text);
    seen.add(text);
    PROMPTS.push({ id, pack, tags: tags.split(' '), label, text });
  }

  /* ---------------------------------------------------------------- packs */
  const PACKS = [
    { id: 'core', name: 'The long life', blurb: 'Questions that work for anyone, anywhere. Always on.' },
    { id: 'prewar', name: 'Before the wireless', blurb: 'Rationing, coal light, telegrams. For elders born before about 1945.' },
    { id: 'midcentury', name: 'The first television', blurb: 'Records, factories, the first family car. For elders born roughly 1945 to 1968.' },
    { id: 'india', name: 'India and South Asia', blurb: 'Monsoon roofs, steel trunks, the corner shop that kept a book of credit.' },
    { id: 'britain', name: 'Britain and Ireland', blurb: 'Washing day, the coalman, the front room kept for visitors.' },
    { id: 'america', name: 'United States and Canada', blurb: 'Porches, county fairs, the drive that took a whole day.' },
    { id: 'diaspora', name: 'Leaving and arriving', blurb: 'For anyone who built a life in a country they were not born in.' }
  ];

  /* -------------------------------------------------------- core: 130 --- */
  P('core','childhood home','The smell of home','What did your house smell like when you came home from school?');
  P('core','childhood home','Where you slept','Where did you sleep as a child, and who else was in the room?');
  P('core','childhood first','Trusted alone','What was the first thing you were ever trusted to do on your own?');
  P('core','childhood home objects','Your corner','Which corner of your childhood home was yours, and what did you keep there?');
  P('core','childhood home','Morning sound','What sound woke you up in the mornings when you were small?');
  P('core','childhood love','The first one','Who was the first person outside your family that you loved?');
  P('core','childhood play','An empty afternoon','What did you do on a long, empty afternoon when there was nothing to do?');
  P('core','childhood hardship','Being frightened','What were you frightened of as a child, and how did you deal with it?');
  P('core','childhood school journey','The walk to school','Describe the walk from your front door to your school.');
  P('core','childhood parents','The punishment','What was the punishment in your house, and did it work?');
  P('core','parents hands',"Her hands","What did your mother's hands look like?");
  P('core','parents work','When he came home','What did your father do when he came home from work?');
  P('core','childhood clothes','Haircuts','Who cut your hair when you were a child?');
  P('core','childhood objects','The thing you loved','What toy or object did you love so much that you still remember it?');
  P('core','childhood family','Overheard','What did the grown ups talk about when they thought you were not listening?');
  P('core','childhood home','Your hiding place','Where did you hide when you wanted to be alone?');
  P('core','childhood play neighbours','The street game','What game did you play in the street, and what were the rules?');
  P('core','childhood family','The oldest person','Who was the oldest person you knew as a child, and what were they like?');
  P('core','childhood home','The forbidden room','Was there a room in your house you were not allowed into?');
  P('core','childhood first','The first memory','What is the first thing you can remember at all?');
  P('core','school','The teacher','Which teacher do you still think about, and why?');
  P('core','school','A surprise talent','What were you good at in school that nobody expected?');
  P('core','school objects','Your school bag','What did you carry your books in?');
  P('core','school humour','In trouble','Tell me about a day you got in trouble at school.');
  P('core','school','Your desk mate','Who did you sit next to, and what happened to them?');
  P('core','school food','School dinners','What did you eat at school, and did you like it?');
  P('core','school work','At fifteen','What did you want to be when you were fifteen?');
  P('core','school hardship','The subject that beat you','Was there a subject that defeated you?');
  P('core','school','The classroom','What did the classroom look like: the desks, the walls, the light?');
  P('core','school parents','How far you got','How far did you go in school, and who decided that?');
  P('core','school','The last day','What did you do on the last day of school?');
  P('core','school parents','Learning to read','Did anyone in your family read to you, or did you learn some other way?');
  P('core','work first money','The first pay','Tell me about your first job and your first pay.');
  P('core','work hands','Working hands','What did your hands look like at the end of a working day?');
  P('core','work','Who taught you','Who taught you how to do the work you did?');
  P('core','work hardship','The hardest day','What was the hardest day you ever had at work?');
  P('core','work hands objects','Your machine','Was there a machine or a tool you knew better than anyone?');
  P('core','work food','Lunch break','Who did you eat lunch with, and what did you talk about?');
  P('core','work','A good boss','Did you ever have a boss you respected, and what made them different?');
  P('core','work clothes','Work clothes','What did you wear to work, and how did you keep it clean?');
  P('core','work hands','Something you made','Tell me about a time you were proud of something you made or fixed.');
  P('core','work hardship money','Out of work','Did you ever lose a job, and what happened next?');
  P('core','work','The sound of it','What did your workplace sound like?');
  P('core','work money','Money you remember','Was there money you earned that you remember spending on something particular?');
  P('core','work','The other life','Did you ever want to do something else for a living?');
  P('core','work','The first day after','What did you do on your first day of retirement?');
  P('core','work humour','The funny one','Who was the funniest person you ever worked with?');
  P('core','work hands','A lost skill','What skill do you have that almost nobody has any more?');
  P('core','work hardship','The near miss','Was there an accident or a near miss at your work?');
  P('core','work neighbours','Standing together','Did you belong to a union, a guild or a group of workers, and what did it do?');
  P('core','work journey','Getting there','What time did you have to get up, and how did you get there?');
  P('core','work family','What you kept back','What did you not tell your family about your work?');
  P('core','love first','The first sight','Where were you when you first saw the person you married?');
  P('core','love clothes','What you wore','What did you wear the day you met?');
  P('core','love humour','The other suitors','Who else was interested in you, and what happened to them?');
  P('core','love','Knowing','How did you know it was serious?');
  P('core','love parents','What they thought','What did your parents think of the match?');
  P('core','marriage celebration','The whole day','Describe your wedding day from waking up to going to sleep.');
  P('core','marriage home','The first home','What was your first home together like?');
  P('core','marriage humour','The first year','What did you argue about in the first year?');
  P('core','marriage humour','The laugh','What did your husband or wife do that made you laugh?');
  P('core','marriage hardship','The near thing','Was there a time you nearly did not stay together?');
  P('core','love advice','What took decades','What did you learn about love that took you decades to understand?');
  P('core','love neighbours','The matchmaker','Who introduced you, and are they still around?');
  P('core','love advice','The kindest thing','What is the kindest thing anyone has ever done for you?');
  P('core','love letters','The letters','Did you write letters to each other, and what did they say?');
  P('core','love humour','Your names','What did you call each other?');
  P('core','marriage advice','The advice you got','What advice about marriage were you given, and was it any good?');
  P('core','family parents','Your grandparents','What do you know about your grandparents that nobody else in the family knows?');
  P('core','parents','Before she was a mother','What was your mother like before she was a mother?');
  P('core','parents','What he believed','What did your father believe that you did not?');
  P('core','family humour','The family legend','Which relative was the family legend, and what did they do?');
  P('core','family hardship','The long argument','Was there a family argument that lasted years?');
  P('core','family','Who you take after','Who in the family did you look like, and who did you take after?');
  P('core','family celebration','End of a hard week','What did your family do at the end of a hard week?');
  P('core','family','The secret','Was there a secret in the family that came out later?');
  P('core','parents money','What they worried about','What did your parents worry about?');
  P('core','family childhood','All of you, small','Tell me about your brothers and sisters when you were all small.');
  P('core','family','The peacemaker','Who was the peacemaker in your family?');
  P('core','family home','The house','What happened to the family house?');
  P('core','family parents','What you swore','What did your parents do that you swore you would never do?');
  P('core','family advice','Right and wrong','Who taught you right from wrong, and how?');
  P('core','family objects','What you inherited','What did you inherit that was not money?');
  P('core','family hardship','The one we do not mention','Is there anyone in the family we never talk about?');
  P('core','food kitchen','Sunday food','What was cooked at your house on a Sunday?');
  P('core','food childhood','The food you hated','What food did you hate as a child, and do you eat it now?');
  P('core','food family','The best cook','Who was the best cook you ever knew?');
  P('core','food hands','No recipe','Describe a dish you can still make without a recipe.');
  P('core','food money hardship','Thin weeks','What did you eat when there was not much money?');
  P('core','food first','The first meal you cooked','What was the first meal you ever cooked for somebody else?');
  P('core','food kitchen home','The kitchen','What did the kitchen look like: the stove, the table, the light?');
  P('core','food celebration','Once a year','Was there a food you only ate once a year?');
  P('core','food family','What was drunk','What did you drink, and what did the grown ups drink?');
  P('core','food family home','Who sat where','Who sat where at your table?');
  P('core','food money journey','The market','What did you buy at the market, and how did you carry it home?');
  P('core','food childhood','Twelve years old','What smell takes you straight back to being twelve years old?');
  P('core','hardship','The hardest thing','What is the hardest thing you have lived through?');
  P('core','hardship','The year everything changed','Was there a year when everything changed?');
  P('core','hardship','Genuinely afraid','Tell me about a time you were genuinely afraid.');
  P('core','hardship money','Nothing at all','What did you do when there was no money at all?');
  P('core','hardship neighbours','Who helped','Who helped you when you needed it, and did you ever repay it?');
  P('core','illness','Being ill','Have you ever been seriously ill, and what did you learn?');
  P('core','hardship','What you lost','What did you lose that you still think about?');
  P('core','hardship','The sleepless night','Was there a night you did not sleep?');
  P('core','hardship family','Bad news','How did you tell somebody bad news?');
  P('core','hardship advice','Keeping going','What did you do to keep going?');
  P('core','family hardship','Strong for someone','Who did you have to be strong for?');
  P('core','hardship advice','The decision','Was there a decision you made that changed everything?');
  P('core','advice','Forgiveness','What did you forgive somebody for?');
  P('core','hardship','The brave thing','Is there something you were brave about that nobody knows?');
  P('core','music','At twenty','What music was playing when you were twenty?');
  P('core','music celebration','Where you danced','Where did you go to dance, and who took you?');
  P('core','music childhood','Still know it','Can you still sing something you learned as a child?');
  P('core','play','The day off','What did you do on your day off?');
  P('core','humour family','What made you laugh','What made your family laugh?');
  P('core','celebration humour','The best party','Tell me about the best party you were ever at.');
  P('core','radio home','On the radio','What did you listen to on the radio?');
  P('core','play','Your team','What was your team, your game, or your sport?');
  P('core','play','The story that stayed','What film or story stayed with you?');
  P('core','journey celebration','The best holiday','What was the best holiday you ever took?');
  P('core','faith advice','What you believe now','What do you believe now that you did not believe at thirty?');
  P('core','faith','What you hope for','What do you pray for, or hope for, if you do?');
  P('core','home village','Where you are from','What was the village or the street you are from actually like?');
  P('core','home journey','Ten minutes anywhere','If you could stand in one place again for ten minutes, where would it be?');
  P('core','advice family','For the great grandchildren','What do you want your great grandchildren to know about you?');
  P('core','advice','Most proud','What are you most proud of?');
  P('core','advice','Differently','What would you do differently?');
  P('core','advice money','Worth the money','What is worth spending money on?');
  P('core','advice','Stop worrying','What should a young person stop worrying about?');
  P('core','advice','What should be said','What do you want said about you?');

  /* ---------------------------------------------------- prewar: 28 ------ */
  P('prewar','war family','The war at home','What do you remember of the war years in your own house?');
  P('prewar','war food','Rationing','What was rationed, and what did your mother do about it?');
  P('prewar','war neighbours','The day it ended','Where were you when the war ended, and what happened on your street?');
  P('prewar','war family hardship','Who did not come back','Did anyone in your family go away and not come back?');
  P('prewar','hardship money','Doing without','What did you do without for years at a time?');
  P('prewar','radio letters','How news arrived','How was news brought to your house?');
  P('prewar','home first','When the light came','Did you have electricity, and when did it arrive?');
  P('prewar','home village','Where water came from','Where did the water come from?');
  P('prewar','journey first','The first motor car','What was the first motor car you ever rode in?');
  P('prewar','clothes hands','Mending','How were clothes mended and passed down in your family?');
  P('prewar','illness money','The doctor','What did a visit from the doctor cost, and what happened if you could not pay?');
  P('prewar','neighbours first','The first television','Who in your street had the first television, and what did you watch?');
  P('prewar','home','Evening light','What did you use for light in the evening?');
  P('prewar','letters','The letters that mattered','What was written on the letters that mattered?');
  P('prewar','letters hardship','A telegram','What did a telegram mean in your house?');
  P('prewar','kitchen food','Keeping food cold','How did you keep food cold?');
  P('prewar','neighbours hardship','When someone died','What did you do when someone in the neighbourhood died?');
  P('prewar','hardship food','Hunger','Did you ever go hungry?');
  P('prewar','home objects first','The machine that changed things','What was the first machine that changed your household?');
  P('prewar','radio family','The wireless','What did the wireless sound like, and who chose what was on?');
  P('prewar','money home','Where money was kept','Where did you keep money, and did anyone use a bank?');
  P('prewar','childhood humour','What children got away with','What did children do that would horrify a parent today?');
  P('prewar','neighbours','The one to avoid','Was there someone in the neighbourhood everyone was afraid of?');
  P('prewar','faith family','A whole Sunday','What did Sunday look like from morning to night?');
  P('prewar','neighbours','Births and deaths','How did people find out who had been born and who had died?');
  P('prewar','weather hardship','The coldest winter','What was the coldest winter you remember?');
  P('prewar','first village','Something new built','Did you ever see something built that had not existed before?');
  P('prewar','clothes childhood','On your feet','What did you wear on your feet?');

  /* ------------------------------------------------ midcentury: 28 ------ */
  P('midcentury','music money first','The first record','What was the first record or cassette you bought with your own money?');
  P('midcentury','neighbours home','Summer evenings','What did your street look like on a summer evening?');
  P('midcentury','home first','The telephone','When did your family get a telephone, and where did it live?');
  P('midcentury','family play','Family television','What did you watch on television as a family?');
  P('midcentury','journey first objects','First set of wheels','What was your first bicycle, motorbike or car?');
  P('midcentury','music play city','Saturday night','Where did young people go in your town on a Saturday night?');
  P('midcentury','clothes parents humour','How you dressed','What did your parents think of the way you dressed?');
  P('midcentury','money city','New in the shops','What was in the shops that had never been there before?');
  P('midcentury','money family','A long distance call','What did a long distance phone call cost, and who did you ring?');
  P('midcentury','radio','The news everyone remembers','Where were you when you heard the news that everyone remembers?');
  P('midcentury','play childhood','A whole summer','What did you do with a whole summer at fourteen?');
  P('midcentury','journey neighbours','The first to go abroad','Who was the first person you knew who went abroad?');
  P('midcentury','clothes','The fashion','What was the fashion, and did you follow it?');
  P('midcentury','money home first','Your first room','What did your first flat or room cost?');
  P('midcentury','money','Saving up','What did you save up for?');
  P('midcentury','work city','The works','What did the local factory, mine or mill mean to your town?');
  P('midcentury','play family','Evenings before','What did you do before there was anything to do at home in the evening?');
  P('midcentury','humour neighbours','The best hair','Who had the best hair on your street?');
  P('midcentury','parents humour','The arguments','What did you argue with your parents about?');
  P('midcentury','food city first','The first supermarket','What did the first supermarket look like to you?');
  P('midcentury','objects family','When film cost money','What did you take a photograph of, back when film cost money?');
  P('midcentury','school journey','The school trip','Where did you go on a school trip?');
  P('midcentury','money objects','On instalments','What was the first thing you bought on credit or instalments?');
  P('midcentury','city money','The shop you miss','Which shop do you still miss?');
  P('midcentury','work money first','The pay packet','What was your first pay packet, and what did it feel like in your hand?');
  P('midcentury','journey family','The Sunday drive','What did a Sunday drive look like?');
  P('midcentury','family','How the family voted','Who did your family vote for, and was it talked about?');
  P('midcentury','school humour',"The autograph book","What did you write in somebody else's autograph book?");

  /* ----------------------------------------------------- india: 42 ------ */
  P('india','weather home','Rain on the roof','What did the monsoon sound like on your roof?');
  P('india','food weather','The first rain','What did your mother make when the first rain came?');
  P('india','journey family','The trains','Tell me about the trains you took, and who saw you off.');
  P('india','clothes family','What she wore','What did your grandmother wear every day?');
  P('india','village neighbours','The end of the lane','What was the name of your village or mohalla, and who lived at the end of the lane?');
  P('india','home childhood','Power cut','What did you do during a power cut?');
  P('india','neighbours city','The callers at the door','Who came to the door selling things, and what did they call out?');
  P('india','food celebration','Wedding food','What did you eat at a wedding when you were a child?');
  P('india','school journey clothes','The uniform','What was your school uniform, and how far did you walk?');
  P('india','family home','On the terrace','What did the family do on the terrace in the evening?');
  P('india','celebration family','The big festival','Which festival was the biggest in your house, and what was your job?');
  P('india','food celebration','Only for the festival','What was cooked only for a festival?');
  P('india','letters family','The letter writer','Who was the letter writer in your family?');
  P('india','village home','Carrying water','What did you carry water in, and from where?');
  P('india','school family','Two languages','Which language did you speak at home, and which one at school?');
  P('india','journey humour','The bus that broke down','Tell me about a journey you took by bus that went wrong.');
  P('india','family advice','The eldest','Who was the eldest in the house, and what did their word mean?');
  P('india','hardship journey family','A move','What did Partition, or any move, mean in your family?');
  P('india','radio home','What the radio brought','What did the radio bring into your house?');
  P('india','money neighbours','The credit book','What was the shop at the corner, and what did they let you take on credit?');
  P('india','village play','At the water','What did you do at the river, the tank or the well?');
  P('india','school first','Learning the letters','Who taught you to read, and in which script?');
  P('india','objects family',"The steel trunk","What was kept in your grandmother's steel trunk or almirah?");
  P('india','celebration clothes money','Wedding clothes','What did people wear to a wedding, and who paid for it?');
  P('india','play first','The first cinema','What was your first cinema, and what did you see?');
  P('india','neighbours humour','What the neighbours knew','Tell me about the neighbours and what they knew about you.');
  P('india','childhood family',"Summer at their house","What did the summer holidays at your grandparents' house look like?");
  P('india','city family journey','Back from the city','What did the family do when someone came back from the city?');
  P('india','work objects parents','What he carried','What did your father carry to work?');
  P('india','food family','The sweet','Which sweet was made in your house, and by whom?');
  P('india','neighbours humour','The daily rounds','What did the milkman, the ironing man or the vegetable seller call you?');
  P('india','marriage family','The negotiation','What was your marriage negotiation like, and who did the talking?');
  P('india','objects money marriage','The jewellery','What jewellery came into the house, and what happened to it?');
  P('india','home first','When it all arrived','What changed in the house when the electricity, the water and the gas finally came?');
  P('india','journey family money','The one who went abroad','Who in the family went abroad first, and what did they send back?');
  P('india','garden village','What you planted','What did you plant, and did it survive?');
  P('india','money family','How money was spoken about','What was said about money in your house?');
  P('india','money family village','The land or the shop','What did the family land or the family shop mean?');
  P('india','family humour','The unannounced visit','Which relative visited without warning, and for how long?');
  P('india','school faith','Learned by heart','What did you learn by heart as a child that you can still say?');
  P('india','illness village','The old remedies','What did a doctor, a vaidya or a hakim do for you?');
  P('india','home food','Five in the morning','What did the house sound like at five in the morning?');

  /* --------------------------------------------------- britain: 26 ------ */
  P('britain','home neighbours','Washing day','What did your street look like on washing day?');
  P('britain','weather family','A wet Sunday','What did you do on a wet Sunday?');
  P('britain','journey celebration','The holidays','Where did you go on your holidays, and how did you get there?');
  P('britain','neighbours money','The corner shop','What was the corner shop, and who ran it?');
  P('britain','weather home hardship','No heating','Tell me about a winter without central heating.');
  P('britain','money childhood','Pocket money','What did you buy with your pocket money?');
  P('britain','neighbours faith','The pub or the hall','What did the pub, the club or the church hall mean in your area?');
  P('britain','weather play','Tide out, snow down','What did you do when the tide was out, or when the snow came?');
  P('britain','neighbours humour','The local character','Who was the local character everybody knew?');
  P('britain','home objects','On the mantelpiece','What was kept on the mantelpiece?');
  P('britain','celebration family','Christmas in your house','What did your family do at Christmas that nobody else did?');
  P('britain','music play','The dance hall','Where did you go dancing?');
  P('britain','neighbours childhood','The milk float','What did the milk float, the coalman or the rag and bone man sound like?');
  P('britain','hardship work','Power cuts and strikes','What did you do during a power cut or a strike?');
  P('britain','journey childhood','The seaside','What did the seaside smell like?');
  P('britain','home objects','The front room','What was kept in the front room that was only for visitors?');
  P('britain','home money family','The first house','What was the first council house, flat or bought house in the family?');
  P('britain','journey neighbours','On the bus','Who did you sit with on the bus?');
  P('britain','school food humour','The dinner ladies','What did your school dinner ladies say to you?');
  P('britain','work city family','The works','Which factory, pit, yard or works did your family work at?');
  P('britain','celebration play','The fair','What did you do at the fair or the fete?');
  P('britain','money hardship','The first queue','What was the first thing you queued for?');
  P('britain','neighbours humour','What was borrowed','What did the neighbours borrow?');
  P('britain','radio family','Sunday afternoon','What did you listen to on a Sunday afternoon?');
  P('britain','humour family','Instead of swearing','What did your family say instead of swearing?');
  P('britain','journey hardship','The night before leaving','What did you do the night before you left home?');

  /* --------------------------------------------------- america: 24 ------ */
  P('america','city play','Friday night','What did your town look like on a Friday night?');
  P('america','journey family objects','The family car','What did your family drive, and where did it take you?');
  P('america','celebration neighbours','The fair or the picnic','What did you do at the county fair, the church picnic or the block party?');
  P('america','weather childhood','The sound of summer','What did the summer sound like where you grew up?');
  P('america','money childhood','The general store','What did you buy at the five and dime or the general store?');
  P('america','neighbours','The neighbour everyone relied on','Who was the neighbour that everybody relied on?');
  P('america','journey first','Driving alone','What did you do the first time you drove alone?');
  P('america','food celebration family','The big meal','What did Thanksgiving, or any big family meal, look like at your house?');
  P('america','hardship work money','A bad season','What did your family do when the crop, the shift or the season was bad?');
  P('america','childhood home','Being alone','Where did you go to be alone as a teenager?');
  P('america','objects journey','In the glove box','What did you keep in the glove box or the truck bed?');
  P('america','food city play','The diner counter','What did the local diner, drugstore counter or soda fountain mean?');
  P('america','weather hardship','The storm','What did you do during a storm or a blackout?');
  P('america','hands family','Who taught you','Who taught you to shoot, fish, drive or fix something?');
  P('america','faith neighbours','Sunday','What did church or the meeting hall mean on a Sunday?');
  P('america','music journey family','In the car','What did your family listen to in the car?');
  P('america','journey family','Moving away','What did moving away mean in your family?');
  P('america','celebration play','The Fourth','What did you do on the Fourth of July?');
  P('america','money home first','The first place','What did your first apartment or first house cost?');
  P('america','food money celebration','A treat','What did you order at a restaurant when it was a treat?');
  P('america','family journey','The visit from far away','Who came to visit from far away, and what did that day look like?');
  P('america','play childhood','Seventeen','What did you do the summer you turned seventeen?');
  P('america','home family',"The porch","What did your grandparents' porch or kitchen look like?");
  P('america','hardship journey objects','Left behind','What did you have to leave behind when your family moved?');

  /* -------------------------------------------------- diaspora: 22 ------ */
  P('diaspora','journey objects','What you brought','What did you bring with you that you still have?');
  P('diaspora','journey first','The first surprise','What was the first thing that surprised you about the new country?');
  P('diaspora','food journey','The first week','What did you eat in the first week, and what did you miss?');
  P('diaspora','journey family','Who met you','Who met you when you arrived?');
  P('diaspora','weather journey','The first winter','What did the first winter feel like?');
  P('diaspora','letters family','What you wrote home','What did you write home about, and what did you leave out?');
  P('diaspora','journey hardship','Going back','How long was it before you went back, and what had changed?');
  P('diaspora','money first','The first thing you bought','What was the first thing you bought here?');
  P('diaspora','neighbours first','The first friend','Who was the first friend you made, and how?');
  P('diaspora','hardship humour','Explaining yourself','What did you have to explain about yourself over and over?');
  P('diaspora','family hardship','What they did not understand','What did your children not understand about where you came from?');
  P('diaspora','journey family','What you stopped doing','What did you stop doing here that you did there?');
  P('diaspora','humour neighbours','What you kept doing','What did you keep doing here that everybody else found strange?');
  P('diaspora','money family','Sending money','What did it cost to send money home, and who was it for?');
  P('diaspora','family','The language of dreams','What language do you dream in?');
  P('diaspora','family advice','The names','What did you name your children, and why?');
  P('diaspora','parents hardship','Telling them','What did your parents say when you told them you were leaving?');
  P('diaspora','hardship family','Who you left','Who did you leave behind, and did you see them again?');
  P('diaspora','letters family','The Sunday call','What did the phone call home sound like on a Sunday?');
  P('diaspora','celebration hardship','The first festival away','What did you do for the first festival away from home?');
  P('diaspora','home advice','When it became home','When did this place start to feel like home, if it did?');
  P('diaspora','advice family','What to keep','What do you want your grandchildren to keep of where you came from?');

  /* ------------------------------------------------------------ engine -- */
  const byId = id => PROMPTS.find(p => p.id === id) || null;
  const byLabel = l => PROMPTS.find(p => p.label === l);

  /* The shortlist a keeper is offered for a very first question. These are the
     ones that reliably open somebody up, rather than the ones that sound grand. */
  const FIRST_QUESTIONS = [
    'The first pay', 'The smell of home', 'The first sight', 'The first memory',
    'Something you made', 'The teacher', 'The best cook', 'What you inherited'
  ].map(l => byLabel(l).id);

  /** Prompts a given teller could be asked: the core pack plus their own packs. */
  function eligible(teller) {
    const packs = teller.packs || [];
    return PROMPTS.filter(p => p.pack === 'core' || packs.indexOf(p.pack) >= 0);
  }

  /* A small stable hash so a week's question does not wander between app opens. */
  function hash(s) {
    let h = 2166136261;
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
    return ((h >>> 0) % 100000) / 100000;
  }

  /**
   * Choose the next question for a teller.
   * weights: { tag: count } read off the stories already in the archive, which is
   * what makes the engine follow a life rather than a list. Once trains have come
   * up three times it starts leaning toward journeys.
   */
  function pick(teller, week, used, skipped, weights) {
    let pool = eligible(teller).filter(p => used.indexOf(p.id) < 0);
    const fresh = pool.filter(p => skipped.indexOf(p.id) < 0);
    if (fresh.length) pool = fresh;
    if (!pool.length) return null;
    let best = null, bestScore = -1;
    for (const p of pool) {
      let s = hash(p.id + '|' + teller.id + '|' + week);
      let bio = 0;
      for (const t of p.tags) bio += Math.min(weights[t] || 0, 4);
      s += bio * 0.09;
      if (p.pack !== 'core') s += 0.06;
      if (s > bestScore) { bestScore = s; best = p; }
    }
    return best;
  }

  const DECADES = ['1920s','1930s','1940s','1950s','1960s','1970s','1980s','1990s','2000s','2010s','2020s'];

  /* The keepsake meter. Forty is the length at which an archive stops being a
     handful of recordings and starts being something you can listen through. */
  const MILESTONES = [
    { n: 1,  label: 'The first story is kept' },
    { n: 5,  label: 'Five stories. A shape appears.' },
    { n: 10, label: 'Ten stories. An hour of a life.' },
    { n: 25, label: 'Twenty five. More than most families ever keep.' },
    { n: 40, label: 'Forty. A keepsake you can listen to end to end.' },
    { n: 52, label: 'Fifty two. A year of Sundays.' },
    { n: 100, label: 'One hundred stories.' }
  ];
  const TARGET = 40;

  return { PACKS, PROMPTS, byId, eligible, pick, FIRST_QUESTIONS, DECADES, MILESTONES, TARGET };
})();
