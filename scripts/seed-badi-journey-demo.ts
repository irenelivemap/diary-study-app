import 'dotenv/config'
import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import bcrypt from 'bcryptjs'
import { resolveDatabaseUrl } from '../app/lib/database-url'

const adapter = new PrismaPg({ connectionString: resolveDatabaseUrl() })
const prisma = new PrismaClient({ adapter })

const STUDY_NAME = 'Demo Study — Badi Visit Journey'
const OTHER_SENTINEL = '__OTHER__'

const PARTICIPANTS = [
  ['Sophie Müller', 'sophie.badi@example.com'],
  ['Luca Bianchi', 'luca.badi@example.com'],
  ['Emma Johansson', 'emma.badi@example.com'],
  ['Noah Garcia', 'noah.badi@example.com'],
  ['Mia Andersen', 'mia.badi@example.com'],
  ['Oliver Chen', 'oliver.badi@example.com'],
  ['Lea Novak', 'lea.badi@example.com'],
  ['Jonas Weber', 'jonas.badi@example.com'],
  ['Hana Kovač', 'hana.badi@example.com'],
  ['Rafael Torres', 'rafael.badi@example.com'],
  ['Yuki Tanaka', 'yuki.badi@example.com'],
  ['Amina Diallo', 'amina.badi@example.com'],
  ['Felix Braun', 'felix.badi@example.com'],
  ['Ingrid Svensson', 'ingrid.badi@example.com'],
  ['Marco Russo', 'marco.badi@example.com'],
  ['Zara Ahmed', 'zara.badi@example.com'],
  ['Elias Bergström', 'elias.badi@example.com'],
  ['Nora Keller', 'nora.badi@example.com'],
] as const

const INFO_NEEDS = ['Opening hours', 'Water temperature', 'Crowding', 'Food options', 'Accessibility', 'Prices', 'Rules / restrictions']
const REASONS = ['Swimming', 'Relaxing', 'Meeting friends', 'Family time', 'Sport / training', 'Cooling down after work']
const INFO_USED = ['Live crowding', 'Opening hours', 'Route information', 'Water quality', 'Facilities map', 'Food options', 'None']
const BADI_FRICTIONS = ['Crowding', 'Finding a spot', 'Changing rooms', 'Food queue', 'Rules unclear', 'Accessibility', 'Payment']
const IMPROVEMENTS = ['Clearer crowding information', 'Better wayfinding', 'More facility details', 'More reliable opening hours', 'Accessibility details', 'Food queue information']

const UNCERTAINTIES = [
  'I was not sure if it would be too crowded after work.',
  'I wanted to know whether there would be enough shade for the afternoon.',
  'I was unsure if the food options would work for my child.',
  'The route seemed fine, but I did not know where the entrance was.',
  'I checked the opening hours twice because I was afraid they had changed.',
  'I had no idea if there was a locker or somewhere safe to leave my bag.',
  'I could not find reliable information about wheelchair accessibility.',
  'I was not sure whether the kiosk accepted card payments.',
  'The water quality indicator on the website was three days old and I did not trust it.',
  'My group was meeting there and I was unsure which entrance we should all use.',
  'I did not know if the grass areas would still be open after recent weather.',
  'I wanted to know roughly how long the changing room queues would be.',
]

const DURING_NOTES = [
  'The crowding information helped me choose a quieter area.',
  'I used the map mostly to find changing rooms and showers.',
  'I did not check much once I arrived because the signs were enough.',
  'I changed plans when I saw the food queue was very long.',
  'The water temperature matched what I expected, so I stayed longer.',
  'There were no signs pointing to the accessible entrance and I had to ask someone.',
  'The kiosk menu was not listed anywhere online, so I had to queue before knowing the prices.',
  'I noticed a crowding board near the entrance that showed numbers but no context for what they meant.',
  'The real-time occupancy info I had checked earlier turned out to be about an hour behind.',
  'Signs for the lockers were too small and only in German. I had to look them up.',
  'I appreciated that the water temperature sign was updated. It matched what I had read earlier.',
  'Once inside I stopped using my phone completely. The layout was clear enough.',
]

const AFTER_NOTES = [
  'The most useful thing was knowing crowding before arriving. It reduced uncertainty.',
  'I would have liked clearer information about lockers and changing rooms.',
  'The visit went smoothly, but I still had to ask staff where to go.',
  'Live information was useful before the visit, but less important once I was there.',
  'I changed where I sat because the crowded area did not match my expectations.',
  'What I needed most was an accurate crowding level, not a general popularity score. They are very different.',
  'The water quality information was the deciding factor. Without it I might not have gone at all.',
  'Nothing about the food or pricing was available in advance. I was surprised by how expensive it was.',
  'Accessibility information online was vague. On arrival I found the path was narrow and had steps.',
  'Before, during, and after — the single most useful piece of data was the real-time entry count.',
  'I had to ask three different people to find the family changing rooms. That should not happen.',
  'Knowing which areas were shaded in the afternoon would have changed where I set up. That information does not exist anywhere.',
  'The information I got beforehand built trust. When it matched reality, I relaxed and enjoyed it more.',
  'I came with children and the lack of facility details — toilets, shallow pool, snack options — made planning much harder than it needed to be.',
  'I ended up leaving earlier than planned because I misjudged how crowded it would get. Better live data would have helped me arrive at a better time.',
]

const CHANGED_HOW_NOTES = [
  'I chose a quieter area and delayed buying food until the queue was shorter.',
  'I arrived 45 minutes earlier than planned after seeing the crowding was rising fast.',
  'I switched from the main lawn to the far side of the facility once I saw the shade map.',
  'We decided to skip the food kiosk entirely after seeing the queue and brought sandwiches next time.',
  'I moved my towel three times trying to find an area that matched what the crowding indicator showed.',
  'I left early because the real-time data showed it would get more crowded, not less.',
  'I found a shaded bench near the accessible path after a staff member pointed me in the right direction.',
]

function pick<T>(items: T[]) {
  return items[Math.floor(Math.random() * items.length)]
}

function sample<T>(items: T[], min: number, max: number) {
  const count = Math.floor(Math.random() * (max - min + 1)) + min
  return [...items].sort(() => Math.random() - 0.5).slice(0, count)
}

function numberBetween(min: number, max: number) {
  return Math.floor(Math.random() * (max - min + 1)) + min
}

function dateDaysAgo(daysAgo: number) {
  const date = new Date()
  date.setDate(date.getDate() - daysAgo)
  return date.toISOString().slice(0, 10)
}

function submittedAt(date: string, hour: number) {
  return new Date(`${date}T${String(hour).padStart(2, '0')}:${String(numberBetween(0, 59)).padStart(2, '0')}:00`)
}

async function answer(entryId: string, questionId: string, value: string, wasShown = true) {
  return prisma.answer.create({ data: { entryId, questionId, value, wasShown } })
}

async function main() {
  const admin = await prisma.user.findFirst({ where: { role: 'ADMIN' } })
  if (!admin) {
    console.error('No admin user found. Run create-admin first.')
    process.exit(1)
  }

  await prisma.study.deleteMany({ where: { name: STUDY_NAME } })

  const study = await prisma.study.create({
    data: {
      name: STUDY_NAME,
      description: 'A journey-based diary study about information needs before, during, and after a Badi visit.',
      consentText: 'You will be asked to answer short questions before, during, and after a Badi visit. Please do not include private health information, precise home addresses, or identifiable photos of other people.',
      contactEmail: admin.email,
      mode: 'JOURNEY',
      journeyName: 'Badi visit',
      isActive: true,
      sequential: false,
      remindersEnabled: false,
      participantEntryAccess: 'SHOW_READ_ONLY',
      reminderNote: 'Start a Badi visit when you are planning to go, then continue with the next stage when you arrive and after you leave.',
    },
  })

  const beforePart = await prisma.part.create({
    data: {
      studyId: study.id,
      name: 'Before the Badi',
      order: 1,
      instructions: 'Answer before you leave or while you are deciding whether to go.',
      flow: 'JOURNEY_STAGE',
      entryPolicy: 'MULTIPLE_PER_DAY',
      unlockRule: 'IMMEDIATE',
      isActive: true,
    },
  })

  const duringPart = await prisma.part.create({
    data: {
      studyId: study.id,
      name: 'At the Badi',
      order: 2,
      instructions: 'Answer once you are at the Badi and have used, checked, or ignored information there.',
      flow: 'JOURNEY_STAGE',
      entryPolicy: 'MULTIPLE_PER_DAY',
      unlockRule: 'AFTER_PREVIOUS_TARGET',
      isActive: true,
    },
  })

  const afterPart = await prisma.part.create({
    data: {
      studyId: study.id,
      name: 'After the visit',
      order: 3,
      instructions: 'Answer after leaving, while the visit is still fresh in your mind.',
      flow: 'JOURNEY_STAGE',
      entryPolicy: 'MULTIPLE_PER_DAY',
      unlockRule: 'AFTER_PREVIOUS_TARGET',
      isActive: true,
    },
  })

  await prisma.question.create({
    data: {
      studyId: study.id,
      partId: beforePart.id,
      page: 1,
      order: 0,
      text: 'Start here when you are thinking about going to a Badi. The next stages will unlock as you go.',
      type: 'CONTENT',
      options: [],
      required: false,
    },
  })

  const plannedTime = await prisma.question.create({
    data: {
      studyId: study.id,
      partId: beforePart.id,
      page: 1,
      order: 1,
      text: 'When are you planning to go?',
      type: 'DATE_TIME',
      options: [],
      required: true,
    },
  })

  const infoNeeded = await prisma.question.create({
    data: {
      studyId: study.id,
      partId: beforePart.id,
      page: 1,
      order: 2,
      text: 'Which information do you need before deciding or leaving?',
      type: 'MULTIPLE_CHOICE',
      options: [...INFO_NEEDS, OTHER_SENTINEL],
      min: 1,
      max: 3,
      required: true,
    },
  })

  const reason = await prisma.question.create({
    data: {
      studyId: study.id,
      partId: beforePart.id,
      page: 1,
      order: 3,
      text: 'What is your main reason for going?',
      type: 'SINGLE_CHOICE',
      options: [...REASONS, OTHER_SENTINEL],
      required: true,
    },
  })

  const expectedCrowding = await prisma.question.create({
    data: {
      studyId: study.id,
      partId: beforePart.id,
      page: 2,
      order: 4,
      text: 'How crowded do you expect it to be?',
      type: 'RATING',
      scaleType: 'numbers_labeled',
      options: ['Empty', 'Quiet', 'Somewhat quiet', 'Moderate', 'Busy', 'Very busy', 'Packed'],
      min: 1,
      max: 7,
      required: true,
    },
  })

  const uncertainty = await prisma.question.create({
    data: {
      studyId: study.id,
      partId: beforePart.id,
      page: 2,
      order: 5,
      text: 'What are you still unsure about before going?',
      type: 'FREE_TEXT',
      options: [],
      required: false,
    },
  })

  const arrivalTime = await prisma.question.create({
    data: {
      studyId: study.id,
      partId: duringPart.id,
      page: 1,
      order: 0,
      text: 'When did you arrive?',
      type: 'DATE_TIME',
      options: [],
      required: true,
    },
  })

  const infoUsed = await prisma.question.create({
    data: {
      studyId: study.id,
      partId: duringPart.id,
      page: 1,
      order: 1,
      text: 'Which information did you actually use while at the Badi?',
      type: 'MULTIPLE_CHOICE',
      options: [...INFO_USED, OTHER_SENTINEL],
      min: 1,
      max: 3,
      required: true,
    },
  })

  const easeFinding = await prisma.question.create({
    data: {
      studyId: study.id,
      partId: duringPart.id,
      page: 1,
      order: 2,
      text: 'How easy was it to find the information you needed there?',
      type: 'RATING',
      scaleType: 'numbers_labeled',
      options: ['Very difficult', 'Difficult', 'Somewhat difficult', 'Neutral', 'Somewhat easy', 'Easy', 'Very easy'],
      min: 1,
      max: 7,
      required: true,
    },
  })

  const changedPlan = await prisma.question.create({
    data: {
      studyId: study.id,
      partId: duringPart.id,
      page: 2,
      order: 3,
      text: 'Did any information change what you did at the Badi?',
      type: 'YES_NO',
      options: [],
      required: true,
    },
  })

  const changedHow = await prisma.question.create({
    data: {
      studyId: study.id,
      partId: duringPart.id,
      page: 2,
      order: 4,
      text: 'What changed because of that information?',
      type: 'FREE_TEXT',
      options: [],
      required: true,
      showIfQuestionId: changedPlan.id,
      showIfValue: 'Yes',
    },
  })

  const duringNote = await prisma.question.create({
    data: {
      studyId: study.id,
      partId: duringPart.id,
      page: 2,
      order: 5,
      text: 'What did you notice about information or signs while you were there?',
      type: 'FREE_TEXT',
      options: [],
      required: false,
    },
  })

  const satisfaction = await prisma.question.create({
    data: {
      studyId: study.id,
      partId: afterPart.id,
      page: 1,
      order: 0,
      text: 'Overall, how satisfied were you with the visit?',
      type: 'RATING',
      scaleType: 'numbers_labeled',
      options: ['Very dissatisfied', 'Dissatisfied', 'Somewhat dissatisfied', 'Neutral', 'Somewhat satisfied', 'Satisfied', 'Very satisfied'],
      min: 1,
      max: 7,
      required: true,
    },
  })

  const friction = await prisma.question.create({
    data: {
      studyId: study.id,
      partId: afterPart.id,
      page: 1,
      order: 1,
      text: 'What most affected your experience?',
      type: 'MULTIPLE_CHOICE',
      options: [...BADI_FRICTIONS, OTHER_SENTINEL],
      min: 1,
      max: 2,
      required: true,
    },
  })

  const matteredMost = await prisma.question.create({
    data: {
      studyId: study.id,
      partId: afterPart.id,
      page: 1,
      order: 2,
      text: 'Which improvement would matter most for next time?',
      type: 'SINGLE_CHOICE',
      options: [...IMPROVEMENTS, OTHER_SENTINEL],
      required: true,
    },
  })

  const wouldReturn = await prisma.question.create({
    data: {
      studyId: study.id,
      partId: afterPart.id,
      page: 2,
      order: 3,
      text: 'Would you go back to this Badi in similar conditions?',
      type: 'YES_NO',
      options: [],
      required: true,
    },
  })

  const afterReflection = await prisma.question.create({
    data: {
      studyId: study.id,
      partId: afterPart.id,
      page: 2,
      order: 4,
      text: 'Looking across before, during, and after: what information mattered most?',
      type: 'FREE_TEXT',
      options: [],
      required: true,
    },
  })

  const tagCrowding = await prisma.questionTag.create({ data: { questionId: afterReflection.id, label: 'Crowding', color: '#0f766e' } })
  const tagWayfinding = await prisma.questionTag.create({ data: { questionId: afterReflection.id, label: 'Wayfinding', color: '#4f46e5' } })
  const tagFacilities = await prisma.questionTag.create({ data: { questionId: afterReflection.id, label: 'Facilities', color: '#f97316' } })
  const tagTrust = await prisma.questionTag.create({ data: { questionId: afterReflection.id, label: 'Trust in info', color: '#e11d48' } })

  const password = await bcrypt.hash('participant123', 10)
  const users = []
  for (const [name, email] of PARTICIPANTS) {
    const demographics = {
      ageRange: pick(['18-24', '25-34', '35-44', '45-54']),
      countryRegion: 'Switzerland',
      language: pick(['German', 'English', 'French', 'Italian']),
      occupation: pick(['Student', 'Designer', 'Researcher', 'Product manager', 'Engineer', 'Service worker']),
      device: pick(['iPhone', 'Android phone']),
    }
    const user = await prisma.user.upsert({
      where: { email },
      update: { name, role: 'PARTICIPANT', timezone: 'Europe/Zurich', demographics },
      create: { email, password, name, role: 'PARTICIPANT', timezone: 'Europe/Zurich', demographics },
    })
    users.push(user)
    await prisma.studyParticipant.upsert({
      where: { studyId_userId: { studyId: study.id, userId: user.id } },
      update: { consentedAt: new Date() },
      create: {
        studyId: study.id,
        userId: user.id,
        consentedAt: new Date(),
      },
    })
  }

  await prisma.studyParticipant.upsert({
    where: { studyId_userId: { studyId: study.id, userId: admin.id } },
    update: {},
    create: { studyId: study.id, userId: admin.id, consentedAt: new Date() },
  })

  let journeyCount = 0
  let entryCount = 0

  for (const [userIndex, user] of users.entries()) {
    const visits = userIndex < 6 ? 2 : 1
    for (let visitIndex = 0; visitIndex < visits; visitIndex++) {
      const daysAgo = userIndex + visitIndex
      const date = dateDaysAgo(daysAgo)
      const plannedHour = numberBetween(10, 16)
      const didChangePlan = Math.random() > 0.55
      const completesVisit = !(userIndex >= 15 && visitIndex === 0)
      const beforeNeeds = sample(INFO_NEEDS, 1, 3)
      const usedInfo = sample(INFO_USED, 1, 3)
      const afterText = pick(AFTER_NOTES)
      const journey = await prisma.journey.create({
        data: {
          studyId: study.id,
          userId: user.id,
          label: `Badi visit #${visitIndex + 1}`,
          createdAt: submittedAt(date, plannedHour - 1),
          completedAt: completesVisit ? submittedAt(date, plannedHour + 5) : null,
        },
      })
      journeyCount += 1

      const beforeEntry = await prisma.entry.create({
        data: {
          studyId: study.id,
          partId: beforePart.id,
          userId: user.id,
          journeyId: journey.id,
          date,
          timezone: 'Europe/Zurich',
          submittedAt: submittedAt(date, plannedHour - 1),
        },
      })
      entryCount += 1
      await answer(beforeEntry.id, plannedTime.id, `${date}T${String(plannedHour).padStart(2, '0')}:00`)
      await answer(beforeEntry.id, infoNeeded.id, JSON.stringify(beforeNeeds))
      await answer(beforeEntry.id, reason.id, pick(REASONS))
      await answer(beforeEntry.id, expectedCrowding.id, String(numberBetween(3, 7)))
      await answer(beforeEntry.id, uncertainty.id, pick(UNCERTAINTIES))

      if (!completesVisit && userIndex === 16) continue

      const duringEntry = await prisma.entry.create({
        data: {
          studyId: study.id,
          partId: duringPart.id,
          userId: user.id,
          journeyId: journey.id,
          date,
          timezone: 'Europe/Zurich',
          submittedAt: submittedAt(date, plannedHour + 1),
        },
      })
      entryCount += 1
      await answer(duringEntry.id, arrivalTime.id, `${date}T${String(plannedHour + 1).padStart(2, '0')}:10`)
      await answer(duringEntry.id, infoUsed.id, JSON.stringify(usedInfo))
      await answer(duringEntry.id, easeFinding.id, String(numberBetween(3, 7)))
      await answer(duringEntry.id, changedPlan.id, didChangePlan ? 'Yes' : 'No')
      await answer(duringEntry.id, changedHow.id, didChangePlan ? pick(CHANGED_HOW_NOTES) : 'N/A - not shown', didChangePlan)
      await answer(duringEntry.id, duringNote.id, pick(DURING_NOTES))

      if (!completesVisit) continue

      const afterEntry = await prisma.entry.create({
        data: {
          studyId: study.id,
          partId: afterPart.id,
          userId: user.id,
          journeyId: journey.id,
          date,
          timezone: 'Europe/Zurich',
          submittedAt: submittedAt(date, plannedHour + 4),
        },
      })
      entryCount += 1
      await answer(afterEntry.id, satisfaction.id, String(numberBetween(4, 7)))
      await answer(afterEntry.id, friction.id, JSON.stringify(sample(BADI_FRICTIONS, 1, 2)))
      await answer(afterEntry.id, matteredMost.id, pick(IMPROVEMENTS))
      await answer(afterEntry.id, wouldReturn.id, Math.random() > 0.2 ? 'Yes' : 'No')
      const reflectionAnswer = await answer(afterEntry.id, afterReflection.id, afterText)
      const tags = [
        afterText.includes('crowd') ? tagCrowding : null,
        afterText.includes('where') || afterText.includes('sign') ? tagWayfinding : null,
        afterText.includes('lockers') || afterText.includes('changing') ? tagFacilities : null,
        afterText.includes('matched') || afterText.includes('uncertainty') || afterText.includes('Live information') ? tagTrust : null,
      ].filter(Boolean) as typeof tagCrowding[]
      if (tags.length > 0) {
        await prisma.answerTag.createMany({
          data: tags.map((tag) => ({ answerId: reflectionAnswer.id, tagId: tag.id })),
          skipDuplicates: true,
        })
      }
    }
  }

  console.log(`✓ Created "${study.name}"`)
  console.log(`  Study id: ${study.id}`)
  console.log(`  Mode: Journey-based study`)
  console.log(`  Stages: Before the Badi → At the Badi → After the visit`)
  console.log(`  Journeys: ${journeyCount}`)
  console.log(`  Entries: ${entryCount}`)
  console.log(`  Participants: ${users.length + 1} (incl. admin)`)
  console.log(`  Example participant login: sophie.badi@example.com / participant123`)
}

main()
  .catch((error) => {
    console.error(error)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
