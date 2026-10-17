// Every line any character says. Nothing is spoken that is not in this file, and the engineer
// reviews it before publishing. Short, mild, friendly even when annoyed; no profanity, no slurs,
// nothing about tribe, religion, gender, disability or real people, no real brands.
//
// Starter set from spec Appendix A. Changed from the Appendix, to meet its own content rules:
//   "Madam, you dey enter or you dey look?"  ->  "You dey enter or you dey look?"
//   "God bless you, rider!"                  ->  "Rider, you are a star!"
//   "You wan kill person?"                   ->  "You wan hurt person?"   (pass C: no talk of killing)

export const LINES = Object.freeze({
  // Danfo conductor at a bus stop, shouting destinations.
  conductor: Object.freeze([
    'Yaba! Yaba! Yaba! Enter, enter!',
    'Oshodi! Oshodi! One seat remaining!',
    'Ojuelegba! Ojuelegba! Fast fast!',
    'Obalende! Obalende! Come, come!',
    'Ikeja! Ikeja! Under bridge!',
    'Surulere! Stadium! Stadium!',
    'CMS! CMS! Anybody for CMS?',
    'Oya, enter! We dey go!',
    'You dey enter or you dey look?',
    'Change! Hold your change!',
  ]),
  // Road user after a near miss with the bike, annoyed.
  annoyed: Object.freeze([
    'Oga, you no get eye?',
    'Wetin dey do you?',
    'Abeg, look road!',
    'Rider! Slow down!',
    'Na your papa get this road?',
    'You wan hurt person?',
  ]),
  // Road user after a near miss with the bike, impressed.
  impressed: Object.freeze([
    'Omo, correct rider!',
    'Chai! Sharp sharp!',
    'Ah ah! Fine rider!',
  ]),
  // Motorist after a collision.
  collision: Object.freeze([
    'My car! See my car!',
    'Ah ah! See me see trouble!',
    'Oga, you must settle me o!',
    'Chai! My bumper!',
    'Look front next time!',
  ]),
  // Pedestrian startled or hit.
  pedestrian: Object.freeze([
    'Ah! I nearly die!',
    'Rider, abeg slow down!',
    'Na so? Na so?',
    'Wahala! I no get another life o!',
    'Look where you dey go!',
  ]),
  // Customer, on a late delivery.
  customerLate: Object.freeze([
    'Wetin happen? I don wait since!',
    'Finally! Na wa o.',
  ]),
  // Customer, on a good delivery.
  customerGood: Object.freeze([
    'Thank you! Sharp sharp!',
    'You try! Take this small something.',
    'Rider, you are a star!',
  ]),
});
