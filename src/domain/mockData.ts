import type { SigningCase } from "./types";

const germanWaiver = [
  "Der Teilnehmer nimmt zur Kenntnis, dass die Teilnahme an der Veranstaltung auf eigene Verantwortung erfolgt.",
  "Die Teilnahme erfolgt auf eigene Gefahr. Der Teilnehmer trägt die zivil- und strafrechtliche Verantwortung für alle von ihm oder dem eingesetzten Fahrzeug verursachten Schäden, soweit kein wirksamer Haftungsausschluss entgegensteht.",
  "Der Teilnehmer bestätigt, dass seine Angaben im Rahmen der Anmeldung richtig und vollständig sind, das Fahrzeug den technischen Anforderungen entspricht und in technisch sowie optisch ordnungsgemäßem Zustand eingesetzt wird.",
  "Im Zusammenhang mit der Veranstaltung wird auf Ansprüche wegen Schäden jeder Art insbesondere gegenüber dem Veranstalter, beteiligten Verbänden, Funktionsträgern, Helfern sowie sonstigen mit Organisation und Durchführung befassten Personen verzichtet, soweit dies rechtlich zulässig ist.",
  "Nicht vom Haftungsverzicht erfasst sind Ansprüche wegen Schäden aus der Verletzung des Lebens, des Körpers oder der Gesundheit sowie Ansprüche, die auf vorsätzlichem oder grob fahrlässigem Verhalten beruhen.",
  "Maßgeblich bleibt die bei der Veranstaltung vor Ort angezeigte und durch Unterschrift bestätigte Fassung des Haftungsverzichts."
].join("\n\n");

const englishWaiver = [
  "The participant acknowledges that participation in the event takes place under personal responsibility.",
  "Participation is at the participant's own risk. The participant bears civil and criminal responsibility for all damage caused by the participant or the vehicle used, unless an effective exclusion of liability applies.",
  "The participant confirms that the registration data is correct and complete and that the vehicle complies with the technical requirements.",
  "Claims for damages in connection with the event are waived to the extent legally permissible, in particular against the organizer, associations, officials, helpers and other persons involved in organization and execution.",
  "The waiver does not cover claims for injury to life, body or health, or claims based on intentional or grossly negligent conduct.",
  "The binding version is the waiver shown on site and confirmed by signature."
].join("\n\n");

export const signingCases: SigningCase[] = [
  {
    id: "case-2026-max-mustermann",
    event: {
      id: "event-2026-dreiecksrennen",
      name: "Dreiecksrennen 2026",
      startsAt: "2026-08-21",
      endsAt: "2026-08-23",
      location: "MSC Oberlausitzer Dreiländereck"
    },
    driver: {
      id: "person-max",
      firstName: "Max",
      lastName: "Mustermann",
      birthdate: "1982-04-12",
      email: "max@example.test",
      phone: "+49 170 1234567",
      country: "DE"
    },
    isMinor: false,
    requiresMedicalCertificate: false,
    contract: {
      documentId: "haftverzicht",
      locale: "de-DE",
      version: "waiver-v2.0",
      textHash: "5dc00be754ed72311584e7df88460471b8a5d8b979eae41f3e69c742f9a06ddd",
      title: "Haftverzicht",
      fullText: germanWaiver,
      source: "mock_backend_context"
    },
    entries: [
      {
        id: "entry-max-auto",
        className: "Tourenwagen",
        orgaCode: "DR-8F2K9A",
        startNumber: "17",
        codriver: {
          id: "person-anna",
          firstName: "Anna",
          lastName: "Beifahrerin",
          birthdate: "1985-11-03",
          email: "anna@example.test",
          phone: null,
          country: "DE"
        },
        vehicles: [
          {
            id: "vehicle-max-bmw",
            vehicleType: "auto",
            make: "BMW",
            model: "2002",
            year: 1973,
            startNumber: "17",
            ownerName: "Max Mustermann",
            role: "primary"
          }
        ]
      },
      {
        id: "entry-max-moto",
        className: "Motorräder",
        orgaCode: "DR-8F2K9A",
        startNumber: "42",
        codriver: null,
        vehicles: [
          {
            id: "vehicle-max-mz",
            vehicleType: "moto",
            make: "MZ",
            model: "ETZ 250",
            year: 1986,
            startNumber: "42",
            ownerName: "Max Mustermann",
            role: "primary"
          }
        ]
      }
    ],
    status: "open",
    signedAt: null
  },
  {
    id: "case-2026-lena-jung",
    event: {
      id: "event-2026-dreiecksrennen",
      name: "Dreiecksrennen 2026",
      startsAt: "2026-08-21",
      endsAt: "2026-08-23",
      location: "MSC Oberlausitzer Dreiländereck"
    },
    driver: {
      id: "person-lena",
      firstName: "Lena",
      lastName: "Jung",
      birthdate: "2010-09-04",
      email: "familie.jung@example.test",
      phone: "+49 170 9876543",
      country: "DE"
    },
    isMinor: true,
    requiresMedicalCertificate: false,
    contract: {
      documentId: "haftverzicht",
      locale: "de-DE",
      version: "waiver-v2.0",
      textHash: "5dc00be754ed72311584e7df88460471b8a5d8b979eae41f3e69c742f9a06ddd",
      title: "Haftverzicht",
      fullText: germanWaiver,
      source: "mock_backend_context"
    },
    entries: [
      {
        id: "entry-lena-moto",
        className: "Motorräder Nachwuchs",
        orgaCode: "DR-2JX91L",
        startNumber: "11",
        codriver: null,
        vehicles: [
          {
            id: "vehicle-lena-simson",
            vehicleType: "moto",
            make: "Simson",
            model: "S51",
            year: 1984,
            startNumber: "11",
            ownerName: "Familie Jung",
            role: "primary"
          }
        ]
      }
    ],
    status: "open",
    signedAt: null
  },
  {
    id: "case-2026-john-smith",
    event: {
      id: "event-2026-dreiecksrennen",
      name: "Dreiecksrennen 2026",
      startsAt: "2026-08-21",
      endsAt: "2026-08-23",
      location: "MSC Oberlausitzer Dreiländereck"
    },
    driver: {
      id: "person-john",
      firstName: "John",
      lastName: "Smith",
      birthdate: "1948-01-20",
      email: "john@example.test",
      phone: "+44 7700 900000",
      country: "GB"
    },
    isMinor: false,
    requiresMedicalCertificate: true,
    contract: {
      documentId: "haftverzicht",
      locale: "en-GB",
      version: "waiver-v2.0",
      textHash: "2d0af1fc20976749575c690623905946ba6726528043bf20b712ce48a545ccdf",
      title: "Waiver",
      fullText: englishWaiver,
      source: "mock_backend_context"
    },
    entries: [
      {
        id: "entry-john-auto",
        className: "Historic Cars",
        orgaCode: "DR-X7P4Q2",
        startNumber: "68",
        codriver: null,
        vehicles: [
          {
            id: "vehicle-john-triumph",
            vehicleType: "auto",
            make: "Triumph",
            model: "TR6",
            year: 1971,
            startNumber: "68",
            ownerName: "John Smith",
            role: "primary"
          }
        ]
      }
    ],
    status: "open",
    signedAt: null
  }
];
