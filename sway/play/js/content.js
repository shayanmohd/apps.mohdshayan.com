/* Sway. Bundled content: grounding scripts, crisis lines, and the Learn cards.
   All of it ships inside the app. None of it is fetched. */
const Content = (() => {

  /* ---------- grounding: one instruction per screen, advanced by tapping anywhere ---------- */
  const SENSES = [
    { big: 'Look around you.', small: 'Not for anything in particular. Just let your eyes move.' },
    { big: 'Name 5 things you can see.', small: 'Out loud if you can. Slowly. A door. A crack in the paint.' },
    { big: 'Name 4 things you can feel.', small: 'The floor under your feet. Fabric on your arms. Air on your face.' },
    { big: 'Name 3 things you can hear.', small: 'Start with the furthest one away.' },
    { big: 'Name 2 things you can smell.', small: 'If you cannot find two, name two smells you like.' },
    { big: 'Name 1 thing you can taste.', small: 'Or one thing you would like to taste later.' },
    { big: 'You are here.', small: 'That was the whole point of the counting. Your attention came back to the room.' }
  ];

  const COLD = [
    { big: 'Find something cold.', small: 'A tap, a bottle from the fridge, a metal rail, a window.' },
    { big: 'Hold it against your wrists.', small: 'The inside, where the skin is thin. Thirty seconds is enough.' },
    { big: 'Now your face, if you can.', small: 'Cold water on the cheeks and around the eyes. Many people find this settles the body quickly.' },
    { big: 'Breathe out longer than you breathe in.', small: 'Even one long exhale counts.' },
    { big: 'Notice the temperature.', small: 'Cold is very hard to ignore, which is exactly why it works.' }
  ];

  const TAPPING = [
    'Cross your arms and rest a hand on each shoulder.',
    'Tap one hand, then the other, in time with the pulses.',
    'Slow, heavy taps. Let your breath do whatever it wants.'
  ];

  /* ---------- crisis lines, cached on the device ----------
     Numbers change. Every entry carries the month it was last checked, and the app says so plainly. */
  const REGIONS = [
    { id: 'us', label: 'United States', emergency: '911', lines: [
      { name: 'Suicide and Crisis Lifeline', number: '988', hours: '24 hours, call or text' },
      { name: 'Crisis Text Line', number: '741741', sms: 'HOME', hours: 'Text the word HOME' } ] },
    { id: 'ca', label: 'Canada', emergency: '911', lines: [
      { name: 'Suicide Crisis Helpline', number: '988', hours: '24 hours, call or text' } ] },
    { id: 'uk', label: 'United Kingdom', emergency: '999', lines: [
      { name: 'Samaritans', number: '116123', disp: '116 123', hours: '24 hours, free to call' },
      { name: 'NHS urgent help', number: '111', hours: '24 hours, choose the mental health option' } ] },
    { id: 'ie', label: 'Ireland', emergency: '112', lines: [
      { name: 'Samaritans', number: '116123', disp: '116 123', hours: '24 hours, free to call' } ] },
    { id: 'in', label: 'India', emergency: '112', lines: [
      { name: 'Tele-MANAS', number: '14416', hours: '24 hours, government helpline' },
      { name: 'AASRA', number: '9820466726', disp: '98204 66726', hours: '24 hours' } ] },
    { id: 'au', label: 'Australia', emergency: '000', lines: [
      { name: 'Lifeline', number: '131114', disp: '13 11 14', hours: '24 hours' } ] },
    { id: 'nz', label: 'New Zealand', emergency: '111', lines: [
      { name: 'Need to talk', number: '1737', hours: '24 hours, call or text' } ] },
    { id: 'de', label: 'Germany', emergency: '112', lines: [
      { name: 'Telefonseelsorge', number: '08001110111', disp: '0800 111 0 111', hours: '24 hours, free to call' } ] },
    { id: 'fr', label: 'France', emergency: '112', lines: [
      { name: 'Numero national de prevention du suicide', number: '3114', hours: '24 hours' } ] },
    { id: 'es', label: 'Spain', emergency: '112', lines: [
      { name: 'Linea de atencion a la conducta suicida', number: '024', hours: '24 hours' } ] },
    { id: 'nl', label: 'Netherlands', emergency: '112', lines: [
      { name: '113 Zelfmoordpreventie', number: '113', hours: '24 hours' } ] },
    { id: 'br', label: 'Brazil', emergency: '192', lines: [
      { name: 'Centro de Valorizacao da Vida', number: '188', hours: '24 hours' } ] },
    { id: 'za', label: 'South Africa', emergency: '112', lines: [
      { name: 'SADAG helpline', number: '0800567567', disp: '0800 567 567', hours: '24 hours' } ] },
    { id: 'other', label: 'Somewhere else', emergency: '112', lines: [] }
  ];
  const region = id => REGIONS.find(r => r.id === id) || REGIONS[REGIONS.length - 1];
  const LINES_CHECKED = 'September 2026';

  /* ---------- the bystander card ---------- */
  const BYSTANDER = [
    'I am having a panic attack.',
    'It will pass. It is not dangerous, and I am not in danger from you.',
    'Please stay with me. Do not ask me questions yet.',
    'Say quiet, ordinary things. Breathe out slowly so I can hear it.',
    'Do not tell me to calm down. Do not crowd me.',
    'If I am not better in 20 minutes, or if this feels different from usual, help me call for medical help.'
  ];

  /* ---------- Learn: ten short cards, written in plain language ---------- */
  const CARDS = [
    { id: 'chest', title: 'Why your chest is tight',
      body: ['A panic attack recruits the muscles you breathe with. The chest wall braces, the diaphragm stops moving freely, and the ribs feel like a belt two notches too small.',
             'That tightness is muscle, not damage. It is one of the most common things people describe, and it eases as the breath lengthens and the muscles are allowed to let go.'] },
    { id: 'air', title: 'Why you cannot get a full breath',
      body: ['This is the cruel one. It feels like suffocating, and the reflex is to gulp more air. But in most panic attacks the body already has plenty of oxygen. The problem is the opposite: fast breathing blows off too much carbon dioxide, and low carbon dioxide is what produces the air hunger.',
             'That is why Sway weights the exhale. A long, slow breath out lets carbon dioxide come back up, and the starving feeling usually fades with it.'] },
    { id: 'tingle', title: 'Why your hands and lips tingle',
      body: ['Same cause as the air hunger. When carbon dioxide drops, the blood chemistry shifts slightly and nerves in the fingers, toes and around the mouth start firing oddly. Hence the pins and needles, and sometimes the feeling that a hand is cramping shut.',
             'It is uncomfortable and it is reversible. It generally settles within a few minutes of slower breathing.'] },
    { id: 'heart', title: 'Why it feels like your heart is failing',
      body: ['Adrenaline makes the heart beat harder and faster and pushes blood toward the big muscles. You feel it thumping in your neck and chest, which is alarming, which produces more adrenaline.',
             'A racing heart during a panic attack is a healthy heart doing what adrenaline tells it. If you have any doubt about what is happening in your body, though, read the card called "When it might not be panic".'] },
    { id: 'exhale', title: 'Why a long exhale helps',
      body: ['Your heart rate speeds up slightly as you breathe in and slows as you breathe out. Making the out-breath longer than the in-breath leans on the slowing half of that cycle.',
             'It is not magic and it is not instant. It is a small, real lever you can reach for when almost nothing else is reachable.'] },
    { id: 'cold', title: 'Why cold water helps',
      body: ['Cold on the face and wrists is a strong, uncomplicated signal. It is hard to ignore, and many people find it interrupts the spiral quickly when breathing alone is not landing.',
             'Cold tap water is enough. You do not need ice, and you should not use anything painful.'] },
    { id: 'ends', title: 'Why it ends',
      body: ['Adrenaline is cleared from the body. It cannot be sustained at that level, so the surge peaks and comes down, usually within about ten minutes even when the shakiness lasts longer.',
             'Nothing you do makes the ending happen, and nothing you fail to do prevents it. The tools are for making the middle more bearable, not for earning the end.'] },
    { id: 'again', title: 'Why it keeps coming back',
      body: ['After a bad one, it is natural to start watching for the next. Scanning your own chest, avoiding the train, checking your pulse. The watching itself keeps the alarm system primed.',
             'Rehearsing the rhythm on a calm day, so your body knows it before it needs it, is worth more than anything you can do mid-storm. That is what Rehearse on the Shelter screen is for.'] },
    { id: 'notpanic', title: 'When it might not be panic',
      body: ['Sway is not able to tell you what is happening in your body, and neither is any other app. Please treat these as reasons to get medical help rather than to open this app:',
             'The first time anything like this has happened. Chest pain that spreads to the arm, jaw or back. Pain that starts during physical effort. Fainting, confusion, weakness on one side, or trouble speaking. A very different feeling from your usual attacks. Any injury, pregnancy complication, or existing heart or lung condition.',
             'Getting checked and being told it was panic is a good outcome. It is not an embarrassment, and plenty of people have needed to do it more than once.'] },
    { id: 'helper', title: 'If you are with someone having one',
      body: ['Stay. Do not ask what is wrong. Do not tell them to calm down, and do not crowd them.',
             'Say plain, boring, repetitive things: you are safe, I am here, it will pass. Breathe out slowly and audibly so they have something to match without being instructed.',
             'Offer something cold and a place to sit. Afterwards, do not make it a conversation about what they should have done differently.',
             'The card in the night shelf is written to be handed to you by the person having the attack, so they do not have to explain any of this while it is happening.'] }
  ];

  return { SENSES, COLD, TAPPING, REGIONS, region, LINES_CHECKED, BYSTANDER, CARDS };
})();
