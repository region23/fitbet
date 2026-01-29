import { db, schema } from "./index";

const defaultCommitments = [
  // Nutrition
  {
    name: "Отказ от сахара",
    description: "Исключить добавленный сахар и сладости",
    category: "nutrition",
  },
  {
    name: "Подсчёт калорий",
    description: "Вести дневник питания и считать калории каждый день",
    category: "nutrition",
  },
  {
    name: "Без алкоголя",
    description: "Полный отказ от алкоголя на время челленджа",
    category: "nutrition",
  },
  {
    name: "Белок в каждом приёме пищи",
    description: "Включать белковые продукты в каждый основной приём пищи",
    category: "nutrition",
  },
  // Exercise
  {
    name: "Тренировки 3+ раз в неделю",
    description: "Минимум 3 тренировки в неделю по 45+ минут",
    category: "exercise",
  },
  {
    name: "10000 шагов в день",
    description: "Ходить минимум 10000 шагов ежедневно",
    category: "exercise",
  },
  {
    name: "Утренняя зарядка",
    description: "Делать зарядку каждое утро минимум 15 минут",
    category: "exercise",
  },
  // Lifestyle
  {
    name: "Сон 7+ часов",
    description: "Спать минимум 7 часов каждую ночь",
    category: "lifestyle",
  },
  {
    name: "Без фастфуда",
    description: "Отказаться от фастфуда и готовой еды",
    category: "lifestyle",
  },
  {
    name: "Вода 2+ литра",
    description: "Пить минимум 2 литра воды в день",
    category: "lifestyle",
  },
];

export async function seedCommitments() {
  const existing = await db.select().from(schema.commitmentTemplates);

  if (existing.length === 0) {
    console.log("Seeding commitment templates...");
    for (const commitment of defaultCommitments) {
      await db.insert(schema.commitmentTemplates).values(commitment);
    }
    console.log(`Seeded ${defaultCommitments.length} commitment templates`);
  } else {
    console.log("Commitment templates already exist, skipping seed");
  }
}
