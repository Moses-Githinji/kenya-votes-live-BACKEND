import { PrismaClient } from "@prisma/client";
import fs from "fs";
import fsPromises from "fs/promises";
import path from "path";
import bcrypt from "bcrypt";
import crypto from "crypto";

const prisma = new PrismaClient();

async function loadJson(file) {
  const data = fs.readFileSync(
    path.join(process.cwd(), "prisma", "data", file),
    "utf-8"
  );
  return JSON.parse(data);
}

// Kenya Counties with realistic registered voters
const counties = [
  {
    code: "001",
    name: "Mombasa",
    registeredVoters: 1200000,
    totalStations: 1200,
  },
  { code: "002", name: "Kwale", registeredVoters: 450000, totalStations: 800 },
  {
    code: "003",
    name: "Kilifi",
    registeredVoters: 800000,
    totalStations: 1100,
  },
  {
    code: "004",
    name: "Tana River",
    registeredVoters: 180000,
    totalStations: 400,
  },
  { code: "005", name: "Lamu", registeredVoters: 120000, totalStations: 300 },
  {
    code: "006",
    name: "Taita Taveta",
    registeredVoters: 250000,
    totalStations: 350,
  },
  {
    code: "007",
    name: "Garissa",
    registeredVoters: 300000,
    totalStations: 500,
  },
  { code: "008", name: "Wajir", registeredVoters: 280000, totalStations: 450 },
  {
    code: "009",
    name: "Mandera",
    registeredVoters: 320000,
    totalStations: 600,
  },
  {
    code: "010",
    name: "Marsabit",
    registeredVoters: 200000,
    totalStations: 350,
  },
  { code: "011", name: "Isiolo", registeredVoters: 150000, totalStations: 200 },
  { code: "012", name: "Meru", registeredVoters: 950000, totalStations: 1200 },
  {
    code: "013",
    name: "Tharaka Nithi",
    registeredVoters: 400000,
    totalStations: 350,
  },
  { code: "014", name: "Embu", registeredVoters: 350000, totalStations: 300 },
  { code: "015", name: "Kitui", registeredVoters: 750000, totalStations: 900 },
  {
    code: "016",
    name: "Machakos",
    registeredVoters: 850000,
    totalStations: 950,
  },
  {
    code: "017",
    name: "Makueni",
    registeredVoters: 600000,
    totalStations: 700,
  },
  {
    code: "018",
    name: "Nyandarua",
    registeredVoters: 450000,
    totalStations: 400,
  },
  { code: "019", name: "Nyeri", registeredVoters: 550000, totalStations: 500 },
  {
    code: "020",
    name: "Kirinyaga",
    registeredVoters: 400000,
    totalStations: 350,
  },
  {
    code: "021",
    name: "Murang'a",
    registeredVoters: 650000,
    totalStations: 600,
  },
  {
    code: "022",
    name: "Kiambu",
    registeredVoters: 1200000,
    totalStations: 1300,
  },
  {
    code: "023",
    name: "Turkana",
    registeredVoters: 350000,
    totalStations: 700,
  },
  {
    code: "024",
    name: "West Pokot",
    registeredVoters: 250000,
    totalStations: 400,
  },
  {
    code: "025",
    name: "Samburu",
    registeredVoters: 150000,
    totalStations: 250,
  },
  {
    code: "026",
    name: "Trans Nzoia",
    registeredVoters: 450000,
    totalStations: 500,
  },
  {
    code: "027",
    name: "Uasin Gishu",
    registeredVoters: 600000,
    totalStations: 650,
  },
  {
    code: "028",
    name: "Elgeyo Marakwet",
    registeredVoters: 300000,
    totalStations: 350,
  },
  { code: "029", name: "Nandi", registeredVoters: 450000, totalStations: 500 },
  {
    code: "030",
    name: "Baringo",
    registeredVoters: 350000,
    totalStations: 400,
  },
  {
    code: "031",
    name: "Laikipia",
    registeredVoters: 250000,
    totalStations: 300,
  },
  {
    code: "032",
    name: "Nakuru",
    registeredVoters: 1100000,
    totalStations: 1200,
  },
  { code: "033", name: "Narok", registeredVoters: 500000, totalStations: 600 },
  {
    code: "034",
    name: "Kajiado",
    registeredVoters: 600000,
    totalStations: 700,
  },
  {
    code: "035",
    name: "Kericho",
    registeredVoters: 450000,
    totalStations: 500,
  },
  { code: "036", name: "Bomet", registeredVoters: 400000, totalStations: 450 },
  {
    code: "037",
    name: "Kakamega",
    registeredVoters: 950000,
    totalStations: 1000,
  },
  { code: "038", name: "Vihiga", registeredVoters: 350000, totalStations: 350 },
  {
    code: "039",
    name: "Bungoma",
    registeredVoters: 750000,
    totalStations: 800,
  },
  { code: "040", name: "Busia", registeredVoters: 450000, totalStations: 500 },
  { code: "041", name: "Siaya", registeredVoters: 550000, totalStations: 600 },
  { code: "042", name: "Kisumu", registeredVoters: 700000, totalStations: 750 },
  {
    code: "043",
    name: "Homa Bay",
    registeredVoters: 600000,
    totalStations: 650,
  },
  { code: "044", name: "Migori", registeredVoters: 500000, totalStations: 550 },
  { code: "045", name: "Kisii", registeredVoters: 750000, totalStations: 800 },
  {
    code: "046",
    name: "Nyamira",
    registeredVoters: 400000,
    totalStations: 400,
  },
  {
    code: "047",
    name: "Nairobi",
    registeredVoters: 2500000,
    totalStations: 3500,
  },
];

// Presidential Candidates (2027 realistic candidates)
const presidentialCandidates = [
  {
    name: "William Ruto",
    party: "UDA",
    bio: "Current President of Kenya, serving since 2022. Former Deputy President and Minister for Agriculture.",
    photoUrl: "https://example.com/photos/ruto.jpg",
  },
  {
    name: "Raila Odinga",
    party: "ODM",
    bio: "Former Prime Minister and veteran opposition leader. Multiple-time presidential candidate.",
    photoUrl: "https://example.com/photos/odinga.jpg",
  },
  {
    name: "Martha Karua",
    party: "NARC-Kenya",
    bio: "Former Justice Minister and anti-corruption crusader. First female presidential candidate.",
    photoUrl: "https://example.com/photos/karua.jpg",
  },
  {
    name: "George Wajackoyah",
    party: "Roots Party",
    bio: "Lawyer and former police officer. Known for his unique campaign promises.",
    photoUrl: "https://example.com/photos/wajackoyah.jpg",
  },
];

// Track used names to avoid duplicates
const usedNames = new Set();

// Generate realistic candidates for each position and county
function generateCandidatesForPosition(position, countyName, countyCode) {
  const candidates = [];

  // Party distribution based on region
  const parties = getPartiesForRegion(countyCode);

  // Generate 3-5 candidates per position
  const numCandidates = 3 + Math.floor(Math.random() * 3); // 3-5 candidates

  for (let i = 0; i < numCandidates; i++) {
    const party = parties[i % parties.length];
    const candidateName = generateCandidateName(
      position,
      countyName,
      party,
      countyCode
    );

    candidates.push({
      name: candidateName,
      party: party,
      position: position,
      regionCode: countyCode,
      bio: generateBio(position, candidateName, countyName, party),
    });
  }

  return candidates;
}

function getPartiesForRegion(countyCode) {
  // Party strongholds (simplified)
  const strongholds = {
    UDA: [
      "032",
      "022",
      "021",
      "020",
      "019",
      "018",
      "030",
      "029",
      "027",
      "026",
      "023",
      "024",
      "025",
      "031",
      "033",
      "034",
      "035",
      "036",
    ], // Rift Valley + Central
    ODM: [
      "042",
      "041",
      "043",
      "044",
      "037",
      "039",
      "040",
      "001",
      "002",
      "003",
      "007",
      "008",
      "009",
      "010",
      "011",
    ], // Nyanza + Coast + Northern
    Jubilee: [
      "047",
      "022",
      "021",
      "020",
      "019",
      "018",
      "012",
      "013",
      "014",
      "015",
      "016",
      "017",
    ], // Nairobi + Central + Eastern
    "NARC-Kenya": ["019", "020", "021", "022", "012", "013", "014"], // Central Kenya
    "Roots Party": ["047", "032", "042", "022"], // Urban areas
    Wiper: ["015", "016", "017", "011"], // Eastern Kenya
    "Ford Kenya": ["037", "039", "038"], // Western Kenya
    ANC: ["037", "039", "038"], // Western Kenya
    PAA: ["001", "002", "003", "004", "005", "006"], // Coast region
    KANU: ["023", "024", "025", "030", "031", "033", "034", "035", "036"], // Rift Valley
  };

  const allParties = [
    "UDA",
    "ODM",
    "Jubilee",
    "NARC-Kenya",
    "Roots Party",
    "Wiper",
    "Ford Kenya",
    "ANC",
    "PAA",
    "KANU",
  ];
  const regionalParties = [];

  // Add parties that are strong in this region
  for (const [party, counties] of Object.entries(strongholds)) {
    if (counties.includes(countyCode)) {
      regionalParties.push(party);
    }
  }

  // Add some other parties for diversity
  const otherParties = allParties.filter(
    (party) => !regionalParties.includes(party)
  );
  const randomOtherParties = otherParties
    .sort(() => 0.5 - Math.random())
    .slice(0, 2);

  return [...regionalParties, ...randomOtherParties];
}

function generateCandidateName(position, countyName, party, regionCode) {
  const firstNames = {
    UDA: [
      "John",
      "Mary",
      "James",
      "Sarah",
      "David",
      "Grace",
      "Peter",
      "Jane",
      "Michael",
      "Faith",
    ],
    ODM: [
      "Raila",
      "Ochieng",
      "Odhiambo",
      "Akinyi",
      "Onyango",
      "Adhiambo",
      "Otieno",
      "Achieng",
      "Ochieng",
      "Atieno",
    ],
    Jubilee: [
      "Uhuru",
      "Kenyatta",
      "Muthoni",
      "Kamau",
      "Wanjiku",
      "Kiprop",
      "Chebet",
      "Kipchoge",
      "Cherono",
      "Kiprotich",
    ],
    "NARC-Kenya": [
      "Martha",
      "Karua",
      "Njeri",
      "Kamau",
      "Wanjiru",
      "Kiprop",
      "Chebet",
      "Kipchoge",
      "Cherono",
      "Kiprotich",
    ],
    "Roots Party": [
      "George",
      "Wajackoyah",
      "Muthoni",
      "Kamau",
      "Wanjiku",
      "Kiprop",
      "Chebet",
      "Kipchoge",
      "Cherono",
      "Kiprotich",
    ],
    Wiper: [
      "Kalonzo",
      "Musyoka",
      "Muthoni",
      "Kamau",
      "Wanjiku",
      "Kiprop",
      "Chebet",
      "Kipchoge",
      "Cherono",
      "Kiprotich",
    ],
    "Ford Kenya": [
      "Moses",
      "Wetangula",
      "Muthoni",
      "Kamau",
      "Wanjiku",
      "Kiprop",
      "Chebet",
      "Kipchoge",
      "Cherono",
      "Kiprotich",
    ],
    ANC: [
      "Musalia",
      "Mudavadi",
      "Muthoni",
      "Kamau",
      "Wanjiku",
      "Kiprop",
      "Chebet",
      "Kipchoge",
      "Cherono",
      "Kiprotich",
    ],
    PAA: [
      "Amason",
      "Kingi",
      "Muthoni",
      "Kamau",
      "Wanjiku",
      "Kiprop",
      "Chebet",
      "Kipchoge",
      "Cherono",
      "Kiprotich",
    ],
    KANU: [
      "Gideon",
      "Moi",
      "Muthoni",
      "Kamau",
      "Wanjiku",
      "Kiprop",
      "Chebet",
      "Kipchoge",
      "Cherono",
      "Kiprotich",
    ],
  };

  const lastNames = {
    UDA: [
      "Ruto",
      "Kiprop",
      "Chebet",
      "Kipchoge",
      "Cherono",
      "Kiprotich",
      "Kipkoech",
      "Chepkoech",
      "Kipngetich",
      "Chepngetich",
    ],
    ODM: [
      "Odinga",
      "Ochieng",
      "Odhiambo",
      "Onyango",
      "Otieno",
      "Ochieng",
      "Odhiambo",
      "Onyango",
      "Otieno",
      "Ochieng",
    ],
    Jubilee: [
      "Kenyatta",
      "Kamau",
      "Wanjiku",
      "Kiprop",
      "Chebet",
      "Kipchoge",
      "Cherono",
      "Kiprotich",
      "Kipkoech",
      "Chepkoech",
    ],
    "NARC-Kenya": [
      "Karua",
      "Kamau",
      "Wanjiru",
      "Kiprop",
      "Chebet",
      "Kipchoge",
      "Cherono",
      "Kiprotich",
      "Kipkoech",
      "Chepkoech",
    ],
    "Roots Party": [
      "Wajackoyah",
      "Kamau",
      "Wanjiku",
      "Kiprop",
      "Chebet",
      "Kipchoge",
      "Cherono",
      "Kiprotich",
      "Kipkoech",
      "Chepkoech",
    ],
    Wiper: [
      "Musyoka",
      "Kamau",
      "Wanjiku",
      "Kiprop",
      "Chebet",
      "Kipchoge",
      "Cherono",
      "Kiprotich",
      "Kipkoech",
      "Chepkoech",
    ],
    "Ford Kenya": [
      "Wetangula",
      "Kamau",
      "Wanjiku",
      "Kiprop",
      "Chebet",
      "Kipchoge",
      "Cherono",
      "Kiprotich",
      "Kipkoech",
      "Chepkoech",
    ],
    ANC: [
      "Mudavadi",
      "Kamau",
      "Wanjiku",
      "Kiprop",
      "Chebet",
      "Kipchoge",
      "Cherono",
      "Kiprotich",
      "Kipkoech",
      "Chepkoech",
    ],
    PAA: [
      "Kingi",
      "Kamau",
      "Wanjiku",
      "Kiprop",
      "Chebet",
      "Kipchoge",
      "Cherono",
      "Kiprotich",
      "Kipkoech",
      "Chepkoech",
    ],
    KANU: [
      "Moi",
      "Kamau",
      "Wanjiku",
      "Kiprop",
      "Chebet",
      "Kipchoge",
      "Cherono",
      "Kiprotich",
      "Kipkoech",
      "Chepkoech",
    ],
  };

  const partyNames = firstNames[party] || firstNames["UDA"];
  const partyLastNames = lastNames[party] || lastNames["UDA"];

  let attempts = 0;
  let fullName;

  do {
    const firstName = partyNames[Math.floor(Math.random() * partyNames.length)];
    const lastName =
      partyLastNames[Math.floor(Math.random() * partyLastNames.length)];
    fullName = `${firstName} ${lastName}`;
    attempts++;

    // Add region code to make it unique if needed
    if (attempts > 10) {
      fullName = `${firstName} ${lastName} ${regionCode}`;
    }
  } while (usedNames.has(fullName) && attempts < 15);

  usedNames.add(fullName);
  return fullName;
}

function generateBio(position, candidateName, countyName, party) {
  const bios = [
    `Experienced ${position.toLowerCase()} candidate with strong community ties in ${countyName}.`,
    `Former ${position.toLowerCase()} with proven track record of development in ${countyName}.`,
    `Young and dynamic ${position.toLowerCase()} aspirant focused on youth empowerment in ${countyName}.`,
    `Veteran politician seeking to serve as ${position.toLowerCase()} for ${countyName}.`,
    `Business leader and community organizer running for ${position.toLowerCase()} in ${countyName}.`,
    `Educationist and development advocate for ${position.toLowerCase()} position in ${countyName}.`,
    `Healthcare professional with vision for better ${countyName} as ${position.toLowerCase()}.`,
    `Agricultural expert and farmer leader for ${position.toLowerCase()} in ${countyName}.`,
  ];

  return bios[Math.floor(Math.random() * bios.length)];
}

// Generate realistic vote counts based on party strongholds
function generateRealisticVotes(candidate, regionCode, position) {
  const baseVoterTurnout = 0.65; // 65% turnout
  const region = counties.find((c) => c.code === regionCode);
  if (!region) return 0;

  const totalVoters = region.registeredVoters * baseVoterTurnout;

  // Party strongholds (simplified)
  const strongholds = {
    UDA: [
      "032",
      "022",
      "021",
      "020",
      "019",
      "018",
      "030",
      "029",
      "027",
      "026",
      "023",
      "024",
      "025",
      "031",
      "033",
      "034",
      "035",
      "036",
    ], // Rift Valley + Central
    ODM: [
      "042",
      "041",
      "043",
      "044",
      "037",
      "039",
      "040",
      "001",
      "002",
      "003",
      "007",
      "008",
      "009",
      "010",
      "011",
    ], // Nyanza + Coast + Northern
    Jubilee: [
      "047",
      "022",
      "021",
      "020",
      "019",
      "018",
      "012",
      "013",
      "014",
      "015",
      "016",
      "017",
    ], // Nairobi + Central + Eastern
    "NARC-Kenya": ["019", "020", "021", "022", "012", "013", "014"], // Central Kenya
    "Roots Party": ["047", "032", "042", "022"], // Urban areas
    Wiper: ["015", "016", "017", "011"], // Eastern Kenya
    "Ford Kenya": ["037", "039", "038"], // Western Kenya
    ANC: ["037", "039", "038"], // Western Kenya
    PAA: ["001", "002", "003", "004", "005", "006"], // Coast region
    KANU: ["023", "024", "025", "030", "031", "033", "034", "035", "036"], // Rift Valley
  };

  const isStronghold = strongholds[candidate.party]?.includes(regionCode);
  let basePercentage;

  // Different percentages based on position
  switch (position) {
    case "PRESIDENT":
      basePercentage = isStronghold ? 0.45 : 0.25;
      break;
    case "GOVERNOR":
      basePercentage = isStronghold ? 0.4 : 0.2;
      break;
    case "SENATOR":
      basePercentage = isStronghold ? 0.35 : 0.15;
      break;
    case "MP":
      basePercentage = isStronghold ? 0.3 : 0.1;
      break;
    case "WOMAN_REPRESENTATIVE":
      basePercentage = isStronghold ? 0.35 : 0.15;
      break;
    case "COUNTY_ASSEMBLY_MEMBER":
      basePercentage = isStronghold ? 0.25 : 0.08;
      break;
    default:
      basePercentage = isStronghold ? 0.3 : 0.15;
  }

  // Add some randomness
  const randomFactor = 0.8 + Math.random() * 0.4; // 0.8 to 1.2
  const voteCount = Math.floor(totalVoters * basePercentage * randomFactor);

  return Math.max(voteCount, 100); // Minimum 100 votes
}

// 1. Distribute 3 million registered voters across all regions
const TOTAL_VOTERS = 3000000;

// Helper to get all region ids for counties, constituencies, wards
async function getAllRegionIds(prisma) {
  const counties = await prisma.region.findMany({ where: { type: "COUNTY" } });
  const constituencies = await prisma.region.findMany({
    where: { type: "CONSTITUENCY" },
  });
  const wards = await prisma.region.findMany({ where: { type: "WARD" } });
  return { counties, constituencies, wards };
}

// Helper to simulate realistic voting per region
async function simulateVotesForRegion(
  prisma,
  region,
  positions,
  candidatesByRegion,
  registeredVoters
) {
  for (const position of positions) {
    const candidates = candidatesByRegion[region.id]?.filter(
      (c) => c.position === position
    );
    if (!candidates || candidates.length === 0) continue;
    // Each voter casts one vote for this position
    let votesRemaining = registeredVoters;
    const voteCounts = Array(candidates.length).fill(0);
    for (let i = 0; i < registeredVoters; i++) {
      const candidateIdx = Math.floor(Math.random() * candidates.length);
      voteCounts[candidateIdx]++;
    }
    for (let j = 0; j < candidates.length; j++) {
      await prisma.vote.update({
        where: { id: candidates[j].voteId },
        data: { voteCount: voteCounts[j] },
      });
    }
  }
}

// Helper to simulate realistic PRESIDENT voting per region with random turnout
async function simulatePresidentVotesForRegion(
  prisma,
  region,
  candidatesByRegion,
  registeredVoters
) {
  // Random turnout between 60% and 80%
  const turnoutRate = 0.6 + Math.random() * 0.2;
  const votesToCast = Math.floor(registeredVoters * turnoutRate);
  const candidates = candidatesByRegion[region.id]?.filter(
    (c) => c.position === "PRESIDENT"
  );
  if (!candidates || candidates.length === 0) return;
  const voteCounts = Array(candidates.length).fill(0);
  for (let i = 0; i < votesToCast; i++) {
    const candidateIdx = Math.floor(Math.random() * candidates.length);
    voteCounts[candidateIdx]++;
  }
  for (let j = 0; j < candidates.length; j++) {
    await prisma.vote.update({
      where: { id: candidates[j].voteId },
      data: { voteCount: voteCounts[j] },
    });
  }
}

// 3. Main seeding logic update
async function seed() {
  console.log(
    "🌱 Starting comprehensive database seeding with real-world regions..."
  );

  // Load data
  // const counties = await loadJson("counties.json");
  const constituencies = await loadJson("constituencies.json");
  const wards = await loadJson("wards.json");

  try {
    // Clear existing data
    await prisma.vote.deleteMany();
    await prisma.candidateTranslation.deleteMany();
    await prisma.candidate.deleteMany();
    await prisma.electionStatus.deleteMany();
    await prisma.region.deleteMany();
    await prisma.feedback.deleteMany();

    // Insert counties
    const countyMap = {};
    for (const county of counties) {
      const region = await prisma.region.create({
        data: {
          name: county.name,
          code: county.code,
          type: "COUNTY",
          registeredVoters: county.registeredVoters || 0,
          totalStations: county.totalStations || 0, // <-- Set totalStations
        },
      });
      countyMap[county.code] = region;
    }
    console.log(`✅ Inserted ${counties.length} counties`);

    // --- INSERT electionStatus for every county and every position ---
    const esPositions = [
      "PRESIDENT",
      "GOVERNOR",
      "SENATOR",
      "MP",
      "WOMAN_REPRESENTATIVE",
      "COUNTY_ASSEMBLY_MEMBER",
    ];
    const esStatusOptions = ["NOT_STARTED", "IN_PROGRESS", "COMPLETED"];
    const esCountiesFromDb = await prisma.region.findMany({
      where: { type: "COUNTY" },
    });
    for (const county of esCountiesFromDb) {
      for (const position of esPositions) {
        await prisma.electionStatus.create({
          data: {
            position,
            region: { connect: { id: county.id } },
            status:
              esStatusOptions[
                Math.floor(Math.random() * esStatusOptions.length)
              ],
            totalStations: 100,
            reportingStations: Math.floor(Math.random() * 100),
            totalVotes: Math.floor(Math.random() * 100000),
            lastUpdate: new Date(),
          },
        });
      }
    }
    console.log("✅ Seeded electionStatus for all counties and positions");

    // Insert constituencies
    const constituencyMap = {};
    for (const constituency of constituencies) {
      const parentCounty = countyMap[constituency.countyCode];
      if (!parentCounty) continue;
      const region = await prisma.region.create({
        data: {
          name: constituency.name,
          code: constituency.code,
          type: "CONSTITUENCY",
          parentId: parentCounty.id,
          registeredVoters: constituency.registeredVoters || 0,
        },
      });
      constituencyMap[constituency.code] = region;
    }
    console.log(`✅ Inserted ${constituencies.length} constituencies`);

    // Insert wards
    let wardCount = 0;
    for (const ward of wards) {
      const parentConstituency = constituencyMap[ward.constituencyCode];
      if (!parentConstituency) continue;
      await prisma.region.create({
        data: {
          name: ward.name,
          code: ward.code,
          type: "WARD",
          parentId: parentConstituency.id,
        },
      });
      wardCount++;
    }
    console.log(`✅ Inserted ${wardCount} wards`);

    // Insert national region for PRESIDENT
    const createdNationalRegion = await prisma.region.create({
      data: {
        name: "Kenya",
        code: "NATIONAL",
        type: "NATIONAL",
        registeredVoters: counties.reduce(
          (sum, c) => sum + (c.registeredVoters || 0),
          0
        ),
      },
    });

    // Create presidential candidates
    const presidentialCandidatesCreated = [];
    for (const candidate of presidentialCandidates) {
      const created = await prisma.candidate.create({
        data: {
          name: candidate.name,
          party: candidate.party,
          position: "PRESIDENT",
          regionId: createdNationalRegion.id,
          regionType: "NATIONAL",
          bio: candidate.bio,
          photoUrl: candidate.photoUrl,
        },
      });
      presidentialCandidatesCreated.push(created);
    }
    console.log(
      `✅ Created ${presidentialCandidatesCreated.length} presidential candidates`
    );

    // Generate candidates for all positions in all counties
    const allCandidates = [];
    const positions = [
      "GOVERNOR",
      "SENATOR",
      "MP",
      "WOMAN_REPRESENTATIVE",
      "COUNTY_ASSEMBLY_MEMBER",
    ];

    const statusOptions = ["NOT_STARTED", "IN_PROGRESS", "COMPLETED"];
    const countiesFromDb = await prisma.region.findMany({
      where: { type: "COUNTY" },
    });

    for (const region of Object.values(countyMap)) {
      // Iterate through counties
      for (const position of positions) {
        const candidates = generateCandidatesForPosition(
          position,
          region.name,
          region.code
        );
        for (const candidate of candidates) {
          const created = await prisma.candidate.create({
            data: {
              name: candidate.name,
              party: candidate.party,
              position: position,
              regionId: region.id,
              regionType: "COUNTY",
              bio: candidate.bio,
            },
          });
          allCandidates.push(created);
        }
      }
    }
    console.log(
      `✅ Created ${allCandidates.length} candidates for all positions`
    );

    // Create vote records for presidential candidates in each county
    const presidentialVotes = [];
    for (const candidate of presidentialCandidatesCreated) {
      for (const region of Object.values(countyMap)) {
        // Iterate through counties
        const voteCount = generateRealisticVotes(
          candidate,
          region.code,
          "PRESIDENT"
        );
        const vote = await prisma.vote.create({
          data: {
            candidateId: candidate.id,
            regionId: region.id,
            position: "PRESIDENT",
            voteCount: voteCount,
            source: "KIEMS",
            isVerified: true,
          },
        });
        presidentialVotes.push(vote);
      }
    }
    console.log(
      `✅ Created ${presidentialVotes.length} presidential vote records`
    );

    // Create vote records for all other candidates
    let otherVotes = 0;
    for (const candidate of allCandidates) {
      const region = Object.values(countyMap).find(
        (r) => r.id === candidate.regionId
      );
      if (region) {
        const voteCount = generateRealisticVotes(
          candidate,
          region.code,
          candidate.position
        );
        await prisma.vote.create({
          data: {
            candidateId: candidate.id,
            regionId: region.id,
            position: candidate.position,
            voteCount: voteCount,
            source: "KIEMS",
            isVerified: true,
          },
        });
        otherVotes++;
      }
    }
    console.log(`✅ Created ${otherVotes} vote records for other positions`);

    // --- ADDITIONAL: MASSIVE CANDIDATE SEEDING ---
    const massiveCandidateCount = 100000;
    const massiveCandidates = [];
    const massiveCandidateNames = new Set();
    const parties = [
      "UDA",
      "ODM",
      "Jubilee",
      "NARC-Kenya",
      "Roots Party",
      "Wiper",
      "Ford Kenya",
      "ANC",
      "PAA",
      "KANU",
    ];
    for (let i = 0; i < massiveCandidateCount; i++) {
      // Random county
      const region =
        Object.values(countyMap)[
          Math.floor(Math.random() * Object.values(countyMap).length)
        ];
      // Random party
      const party = parties[Math.floor(Math.random() * parties.length)];
      // Random name
      let name;
      do {
        name = `Candidate${Math.floor(Math.random() * 100000000)}_${party}_${region.code}`;
      } while (massiveCandidateNames.has(name));
      massiveCandidateNames.add(name);
      // Random position
      const position = positions[Math.floor(Math.random() * positions.length)];
      massiveCandidates.push({
        name,
        party,
        position,
        regionId: region.id,
        regionType: "COUNTY",
        bio: `Massive test candidate for ${position} in ${region.name}`,
      });
    }
    // Batch insert for performance
    console.log(
      `🚀 Inserting ${massiveCandidates.length} massive test candidates...`
    );
    for (let i = 0; i < massiveCandidates.length; i += 1000) {
      await prisma.candidate.createMany({
        data: massiveCandidates.slice(i, i + 1000),
        skipDuplicates: true,
      });
      if ((i + 1000) % 10000 === 0) {
        console.log(`  ...inserted ${i + 1000} so far`);
      }
    }
    console.log(
      `✅ Inserted ${massiveCandidates.length} massive test candidates`
    );

    // Create election status for all positions
    await prisma.electionStatus.createMany({
      data: [
        {
          position: "PRESIDENT",
          status: "COMPLETED",
          totalStations: 40000,
          reportingStations: 40000,
          totalVotes: 15000000,
          regionId: createdNationalRegion.id,
        },
        {
          position: "GOVERNOR",
          status: "COMPLETED",
          totalStations: 40000,
          reportingStations: 40000,
          totalVotes: 15000000,
          regionId: createdNationalRegion.id,
        },
        {
          position: "SENATOR",
          status: "IN_PROGRESS",
          totalStations: 40000,
          reportingStations: 35000,
          totalVotes: 12000000,
          regionId: createdNationalRegion.id,
        },
        {
          position: "MP",
          status: "IN_PROGRESS",
          totalStations: 40000,
          reportingStations: 32000,
          totalVotes: 11000000,
          regionId: createdNationalRegion.id,
        },
        {
          position: "WOMAN_REPRESENTATIVE",
          status: "IN_PROGRESS",
          totalStations: 40000,
          reportingStations: 30000,
          totalVotes: 10000000,
          regionId: createdNationalRegion.id,
        },
        {
          position: "COUNTY_ASSEMBLY_MEMBER",
          status: "NOT_STARTED",
          totalStations: 40000,
          reportingStations: 0,
          totalVotes: 0,
          regionId: createdNationalRegion.id,
        },
      ],
    });

    // Create some sample feedback
    await prisma.feedback.createMany({
      data: [
        {
          name: "Jane Citizen",
          type: "general",
          message: "Great platform for tracking election results!",
          email: "citizen@example.com",
        },
        {
          name: "John Observer",
          type: "issue",
          message: "Some results seem to be loading slowly",
          email: "observer@example.com",
        },
        {
          name: "Mary Voter",
          type: "suggestion",
          message: "Please add more detailed candidate information",
          email: "voter@example.com",
        },
      ],
    });

    // Generate unique passwords for each admin
    function generatePassword() {
      return (
        crypto.randomBytes(4).toString("hex") +
        "-" +
        crypto.randomBytes(4).toString("hex") +
        "-!A1"
      );
    }

    const adminUsers = [
      {
        email: "commissioner@iebc.or.ke",
        name: "IEBC Commissioner",
        role: "IEBC_COMMISSIONER",
      },
      {
        email: "returning@iebc.or.ke",
        name: "Returning Officer",
        role: "RETURNING_OFFICER",
      },
      {
        email: "presiding@iebc.or.ke",
        name: "Presiding Officer",
        role: "PRESIDING_OFFICER",
      },
      {
        email: "clerk@iebc.or.ke",
        name: "Election Clerk",
        role: "ELECTION_CLERK",
      },
      {
        email: "sysadmin@iebc.or.ke",
        name: "System Administrator",
        role: "SYSTEM_ADMINISTRATOR",
      },
    ];

    const adminUserData = [];
    const adminCredentials = [];
    for (const user of adminUsers) {
      const password = generatePassword();
      const hashed = await bcrypt.hash(password, 10);
      adminUserData.push({
        ...user,
        password: hashed,
        isActive: true,
      });
      const credLine = `Admin user: ${user.email} | Password: ${password}`;
      adminCredentials.push(credLine);
      console.log(credLine);
    }

    await prisma.user.createMany({
      data: adminUserData,
      skipDuplicates: true,
    });
    // Save credentials to a file at the project root
    await fsPromises
      .writeFile(
        path.join(process.cwd(), "admin-credentials.txt"),
        adminCredentials.join("\n") + "\n"
      )
      .then(() => {
        console.log("✅ Saved admin credentials to admin-credentials.txt");
      })
      .catch((error) => {
        console.error("❌ Error saving admin credentials:", error);
      });
    console.log("✅ Saved admin credentials to admin-credentials.txt");
    console.log("✅ Created sample users for all new roles");

    // --- VOTER DISTRIBUTION AND SIMULATION LOGIC (after all regions/candidates) ---
    // Load counties from DB
    const dbCounties = await prisma.region.findMany({
      where: { type: "COUNTY" },
    });
    const countyVoters = Math.floor(TOTAL_VOTERS / dbCounties.length);
    for (const county of dbCounties) {
      await prisma.region.update({
        where: { id: county.id },
        data: { registeredVoters: countyVoters },
      });
    }
    // Build a map of candidates by region
    const allVotes = await prisma.vote.findMany();
    const candidatesByRegion = {};
    for (const vote of allVotes) {
      if (!candidatesByRegion[vote.regionId])
        candidatesByRegion[vote.regionId] = [];
      candidatesByRegion[vote.regionId].push({
        voteId: vote.id,
        position: vote.position,
      });
    }
    // Simulate votes for each county, capping total votes at registeredVoters
    for (const county of dbCounties) {
      await simulateVotesForRegion(
        prisma,
        county,
        positions,
        candidatesByRegion,
        countyVoters
      );
    }
    // Simulate presidential votes at national level
    if (!createdNationalRegion) {
      createdNationalRegion = await prisma.region.findFirst({
        where: { type: "NATIONAL" },
      });
    }
    if (createdNationalRegion) {
      await simulateVotesForRegion(
        prisma,
        createdNationalRegion,
        ["PRESIDENT"],
        candidatesByRegion,
        countyVoters * dbCounties.length
      );
    }

    // Simulate PRESIDENT votes for each county, capping total votes at a realistic turnout
    for (const county of dbCounties) {
      await simulatePresidentVotesForRegion(
        prisma,
        county,
        candidatesByRegion,
        countyVoters
      );
    }
    // Simulate PRESIDENT votes at national level
    if (createdNationalRegion) {
      await simulatePresidentVotesForRegion(
        prisma,
        createdNationalRegion,
        candidatesByRegion,
        countyVoters * dbCounties.length
      );
    }

    const totalCandidates =
      presidentialCandidatesCreated.length + allCandidates.length;
    const totalVotes = presidentialVotes.length + otherVotes;

    console.log("🎉 Comprehensive database seeding completed successfully!");
    console.log("\n📊 Complete Data Summary:");
    console.log(`- ${Object.values(countyMap).length} Counties created`);
    console.log(`- ${totalCandidates} Total candidates (all positions)`);
    console.log(
      `  - ${presidentialCandidatesCreated.length} Presidential candidates`
    );
    console.log(`  - ${allCandidates.length} Other position candidates`);
    console.log(`- ${totalVotes} Total vote records created`);
    console.log(
      `- All positions covered: President, Governor, Senator, MP, Woman Representative, County Assembly Member`
    );
    console.log("\n🔗 Test your API with:");
    console.log("curl http://localhost:3000/api/results/PRESIDENT/COUNTY/001");
    console.log("curl http://localhost:3000/api/results/GOVERNOR/COUNTY/047");
    console.log("curl http://localhost:3000/api/results/SENATOR/COUNTY/032");
    console.log("curl http://localhost:3000/api/status");
  } catch (error) {
    console.error("❌ Error seeding database:", error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

seed();
