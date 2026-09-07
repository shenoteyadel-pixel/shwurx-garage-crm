// Structured, extensible vehicle catalog: make -> model (generation year range)
// -> variant/trim, with a body style per model. This is the single source of
// truth for the intake vehicle picker (year-aware model filtering + search).
//
// It is intentionally DATA, not UI: new models/variants can be added here
// without touching any component. Free-text entry is always still allowed in
// the picker, so a vehicle missing from this list can still be recorded.

import type { BodyType } from "@/lib/vehicle"

export type CatalogVariant = {
  name: string // e.g. "SL 63 AMG", "S 580", "720S"
  yearStart?: number // defaults to the parent model's yearStart
  yearEnd?: number | null // null/undefined = still current
}

export type CatalogModel = {
  name: string // canonical model family, e.g. "S-Class", "SL", "720S"
  body: BodyType
  yearStart: number
  yearEnd?: number | null // null/undefined = still in production
  variants?: CatalogVariant[]
}

export type CatalogMake = {
  name: string // canonical make, e.g. "Mercedes-Benz"
  aliases?: string[] // extra spellings the search/lookup should accept
  models: CatalogModel[]
}

const CURRENT_YEAR = new Date().getFullYear()
// Allow next-model-year vehicles (dealers register them early).
const MAX_YEAR = CURRENT_YEAR + 1

/* ============================ CATALOG DATA ============================ */

export const VEHICLE_CATALOG: CatalogMake[] = [
  {
    name: "Mercedes-Benz",
    aliases: ["mercedes", "mercedesbenz", "benz", "merc", "mb", "mercedez", "mercades"],
    models: [
      { name: "A-Class", body: "hatchback", yearStart: 2013, variants: [{ name: "A 200" }, { name: "A 250" }, { name: "A 35 AMG", yearStart: 2019 }, { name: "A 45 AMG", yearStart: 2013 }] },
      { name: "B-Class", body: "van", yearStart: 2011, variants: [{ name: "B 180" }, { name: "B 200" }, { name: "B 250" }] },
      { name: "C-Class", body: "sedan", yearStart: 1993, variants: [{ name: "C 180" }, { name: "C 200" }, { name: "C 300" }, { name: "C 43 AMG", yearStart: 2016 }, { name: "C 63 AMG", yearStart: 2008 }] },
      { name: "CLA", body: "sedan", yearStart: 2013, variants: [{ name: "CLA 200" }, { name: "CLA 250" }, { name: "CLA 35 AMG", yearStart: 2019 }, { name: "CLA 45 AMG", yearStart: 2013 }] },
      { name: "CLE", body: "coupe", yearStart: 2023, variants: [{ name: "CLE 300" }, { name: "CLE 450" }, { name: "CLE 53 AMG" }] },
      { name: "CLK", body: "coupe", yearStart: 1997, yearEnd: 2010, variants: [{ name: "CLK 320" }, { name: "CLK 500" }, { name: "CLK 63 AMG" }] },
      { name: "CLS", body: "sedan", yearStart: 2004, variants: [{ name: "CLS 350" }, { name: "CLS 450" }, { name: "CLS 53 AMG", yearStart: 2018 }, { name: "CLS 63 AMG", yearStart: 2011, yearEnd: 2018 }] },
      { name: "E-Class", body: "sedan", yearStart: 1993, variants: [{ name: "E 200" }, { name: "E 300" }, { name: "E 350" }, { name: "E 450" }, { name: "E 53 AMG", yearStart: 2018 }, { name: "E 63 AMG", yearStart: 2009 }] },
      { name: "S-Class", body: "sedan", yearStart: 1972, variants: [{ name: "S 450" }, { name: "S 500" }, { name: "S 560", yearStart: 2017, yearEnd: 2020 }, { name: "S 580", yearStart: 2020 }, { name: "S 63 AMG", yearStart: 2006 }, { name: "S 65 AMG", yearStart: 2006, yearEnd: 2020 }] },
      { name: "Maybach S-Class", body: "sedan", yearStart: 2015, variants: [{ name: "Maybach S 580", yearStart: 2020 }, { name: "Maybach S 600", yearStart: 2015, yearEnd: 2020 }, { name: "Maybach S 650", yearStart: 2017, yearEnd: 2021 }, { name: "Maybach S 680", yearStart: 2021 }] },
      { name: "SL", body: "convertible", yearStart: 1954, variants: [{ name: "SL 43", yearStart: 2022 }, { name: "SL 55 AMG", yearStart: 2021 }, { name: "SL 63 AMG", yearStart: 2021 }, { name: "SL 400", yearStart: 2012, yearEnd: 2020 }, { name: "SL 500", yearStart: 2001, yearEnd: 2020 }] },
      { name: "SLC", body: "convertible", yearStart: 2016, yearEnd: 2020, variants: [{ name: "SLC 200" }, { name: "SLC 300" }, { name: "SLC 43 AMG" }] },
      { name: "SLK", body: "convertible", yearStart: 1996, yearEnd: 2016, variants: [{ name: "SLK 200" }, { name: "SLK 350" }, { name: "SLK 55 AMG" }] },
      { name: "AMG GT", body: "sports", yearStart: 2014, variants: [{ name: "AMG GT" }, { name: "AMG GT S" }, { name: "AMG GT C" }, { name: "AMG GT R" }, { name: "AMG GT 43", yearStart: 2018 }, { name: "AMG GT 53", yearStart: 2018 }, { name: "AMG GT 63", yearStart: 2018 }, { name: "AMG GT Black Series", yearStart: 2020 }] },
      { name: "GLA", body: "suv", yearStart: 2013, variants: [{ name: "GLA 200" }, { name: "GLA 250" }, { name: "GLA 35 AMG", yearStart: 2020 }, { name: "GLA 45 AMG", yearStart: 2020 }] },
      { name: "GLB", body: "suv", yearStart: 2019, variants: [{ name: "GLB 200" }, { name: "GLB 250" }, { name: "GLB 35 AMG" }] },
      { name: "GLC", body: "suv", yearStart: 2015, variants: [{ name: "GLC 200" }, { name: "GLC 300" }, { name: "GLC 43 AMG" }, { name: "GLC 63 AMG" }] },
      { name: "GLE", body: "suv", yearStart: 2015, variants: [{ name: "GLE 350" }, { name: "GLE 450" }, { name: "GLE 53 AMG" }, { name: "GLE 63 AMG" }] },
      { name: "GLS", body: "suv", yearStart: 2016, variants: [{ name: "GLS 450" }, { name: "GLS 500" }, { name: "GLS 580" }, { name: "GLS 63 AMG" }, { name: "Maybach GLS 600", yearStart: 2020 }] },
      { name: "G-Class", body: "suv", yearStart: 1979, variants: [{ name: "G 500" }, { name: "G 550" }, { name: "G 63 AMG", yearStart: 2012 }, { name: "G 65 AMG", yearStart: 2012, yearEnd: 2018 }] },
      { name: "GLK", body: "suv", yearStart: 2008, yearEnd: 2015 },
      { name: "EQE", body: "sedan", yearStart: 2022, variants: [{ name: "EQE 350" }, { name: "EQE 500" }, { name: "AMG EQE 53" }] },
      { name: "EQS", body: "sedan", yearStart: 2021, variants: [{ name: "EQS 450" }, { name: "EQS 580" }, { name: "AMG EQS 53" }, { name: "Maybach EQS 680 SUV" }] },
      { name: "EQC", body: "suv", yearStart: 2019, yearEnd: 2023 },
      { name: "V-Class", body: "van", yearStart: 2014 },
    ],
  },
  {
    name: "BMW",
    aliases: ["bmw"],
    models: [
      { name: "1 Series", body: "hatchback", yearStart: 2004, variants: [{ name: "118i" }, { name: "120i" }, { name: "M135i" }] },
      { name: "2 Series", body: "coupe", yearStart: 2014, variants: [{ name: "220i" }, { name: "230i" }, { name: "M240i" }, { name: "M2" }] },
      { name: "3 Series", body: "sedan", yearStart: 1975, variants: [{ name: "320i" }, { name: "330i" }, { name: "340i" }, { name: "M3", yearStart: 1986 }] },
      { name: "4 Series", body: "coupe", yearStart: 2013, variants: [{ name: "420i" }, { name: "430i" }, { name: "440i" }, { name: "M4" }] },
      { name: "5 Series", body: "sedan", yearStart: 1972, variants: [{ name: "520i" }, { name: "530i" }, { name: "540i" }, { name: "M5", yearStart: 1985 }] },
      { name: "6 Series", body: "coupe", yearStart: 2003, variants: [{ name: "640i" }, { name: "650i" }, { name: "M6" }] },
      { name: "7 Series", body: "sedan", yearStart: 1977, variants: [{ name: "730i" }, { name: "740i" }, { name: "750i" }, { name: "760i" }] },
      { name: "8 Series", body: "coupe", yearStart: 1989, variants: [{ name: "840i" }, { name: "850i" }, { name: "M8" }] },
      { name: "X1", body: "suv", yearStart: 2009, variants: [{ name: "sDrive20i" }, { name: "xDrive28i" }] },
      { name: "X2", body: "suv", yearStart: 2018 },
      { name: "X3", body: "suv", yearStart: 2003, variants: [{ name: "xDrive30i" }, { name: "M40i" }, { name: "X3 M" }] },
      { name: "X4", body: "suv", yearStart: 2014, variants: [{ name: "xDrive30i" }, { name: "M40i" }, { name: "X4 M" }] },
      { name: "X5", body: "suv", yearStart: 1999, variants: [{ name: "xDrive40i" }, { name: "xDrive50i" }, { name: "M50i" }, { name: "X5 M" }] },
      { name: "X6", body: "suv", yearStart: 2008, variants: [{ name: "xDrive40i" }, { name: "M50i" }, { name: "X6 M" }] },
      { name: "X7", body: "suv", yearStart: 2018, variants: [{ name: "xDrive40i" }, { name: "M60i" }, { name: "Alpina XB7" }] },
      { name: "Z4", body: "convertible", yearStart: 2002, variants: [{ name: "sDrive20i" }, { name: "sDrive30i" }, { name: "M40i" }] },
      { name: "i4", body: "sedan", yearStart: 2021, variants: [{ name: "eDrive40" }, { name: "M50" }] },
      { name: "i5", body: "sedan", yearStart: 2023 },
      { name: "i7", body: "sedan", yearStart: 2022, variants: [{ name: "eDrive50" }, { name: "xDrive60" }, { name: "M70" }] },
      { name: "iX", body: "suv", yearStart: 2021, variants: [{ name: "xDrive40" }, { name: "xDrive50" }, { name: "M60" }] },
    ],
  },
  {
    name: "Porsche",
    aliases: ["porsche", "porche", "porsch"],
    models: [
      { name: "911", body: "sports", yearStart: 1964, variants: [{ name: "Carrera" }, { name: "Carrera S" }, { name: "Carrera 4S" }, { name: "Turbo" }, { name: "Turbo S" }, { name: "GT3" }, { name: "GT3 RS" }, { name: "GT2 RS" }, { name: "Targa 4S" }] },
      { name: "718 Cayman", body: "sports", yearStart: 2016, variants: [{ name: "Cayman" }, { name: "Cayman S" }, { name: "Cayman GTS" }, { name: "Cayman GT4" }] },
      { name: "718 Boxster", body: "convertible", yearStart: 2016, variants: [{ name: "Boxster" }, { name: "Boxster S" }, { name: "Boxster GTS" }, { name: "Boxster Spyder" }] },
      { name: "Panamera", body: "sedan", yearStart: 2009, variants: [{ name: "Panamera" }, { name: "4S" }, { name: "GTS" }, { name: "Turbo" }, { name: "Turbo S" }] },
      { name: "Taycan", body: "sedan", yearStart: 2019, variants: [{ name: "Taycan" }, { name: "4S" }, { name: "GTS" }, { name: "Turbo" }, { name: "Turbo S" }] },
      { name: "Macan", body: "suv", yearStart: 2014, variants: [{ name: "Macan" }, { name: "Macan S" }, { name: "Macan GTS" }, { name: "Macan Turbo" }] },
      { name: "Cayenne", body: "suv", yearStart: 2002, variants: [{ name: "Cayenne" }, { name: "Cayenne S" }, { name: "Cayenne GTS" }, { name: "Cayenne Turbo" }, { name: "Turbo GT", yearStart: 2021 }] },
    ],
  },
  {
    name: "Audi",
    aliases: ["audi", "audy"],
    models: [
      { name: "A3", body: "sedan", yearStart: 1996, variants: [{ name: "A3" }, { name: "S3" }, { name: "RS 3" }] },
      { name: "A4", body: "sedan", yearStart: 1994, variants: [{ name: "A4" }, { name: "S4" }, { name: "RS 4" }] },
      { name: "A5", body: "coupe", yearStart: 2007, variants: [{ name: "A5" }, { name: "S5" }, { name: "RS 5" }] },
      { name: "A6", body: "sedan", yearStart: 1994, variants: [{ name: "A6" }, { name: "S6" }, { name: "RS 6" }] },
      { name: "A7", body: "sedan", yearStart: 2010, variants: [{ name: "A7" }, { name: "S7" }, { name: "RS 7" }] },
      { name: "A8", body: "sedan", yearStart: 1994, variants: [{ name: "A8" }, { name: "A8 L" }, { name: "S8" }] },
      { name: "Q3", body: "suv", yearStart: 2011, variants: [{ name: "Q3" }, { name: "RS Q3" }] },
      { name: "Q5", body: "suv", yearStart: 2008, variants: [{ name: "Q5" }, { name: "SQ5" }] },
      { name: "Q7", body: "suv", yearStart: 2005, variants: [{ name: "Q7" }, { name: "SQ7" }] },
      { name: "Q8", body: "suv", yearStart: 2018, variants: [{ name: "Q8" }, { name: "SQ8" }, { name: "RS Q8" }] },
      { name: "e-tron", body: "suv", yearStart: 2018, variants: [{ name: "e-tron" }, { name: "e-tron S" }, { name: "Q8 e-tron" }] },
      { name: "TT", body: "coupe", yearStart: 1998, yearEnd: 2023, variants: [{ name: "TT" }, { name: "TTS" }, { name: "TT RS" }] },
      { name: "R8", body: "sports", yearStart: 2006, yearEnd: 2024, variants: [{ name: "R8 V10" }, { name: "R8 V10 Plus" }, { name: "R8 V10 Performance" }] },
    ],
  },
  {
    name: "Land Rover",
    aliases: ["landrover", "land"],
    models: [
      { name: "Defender", body: "suv", yearStart: 1983, variants: [{ name: "Defender 90" }, { name: "Defender 110" }, { name: "Defender 130", yearStart: 2022 }] },
      { name: "Discovery", body: "suv", yearStart: 1989, variants: [{ name: "Discovery" }, { name: "Discovery Sport" }] },
    ],
  },
  {
    name: "Range Rover",
    aliases: ["rangerover", "range", "rover", "rangie"],
    models: [
      { name: "Range Rover", body: "suv", yearStart: 1970, variants: [{ name: "Range Rover" }, { name: "Autobiography" }, { name: "SV" }, { name: "SVAutobiography" }] },
      { name: "Range Rover Sport", body: "suv", yearStart: 2005, variants: [{ name: "Sport" }, { name: "Sport SVR" }, { name: "Sport SV", yearStart: 2023 }] },
      { name: "Range Rover Velar", body: "suv", yearStart: 2017, variants: [{ name: "Velar" }, { name: "Velar R-Dynamic" }] },
      { name: "Range Rover Evoque", body: "suv", yearStart: 2011, variants: [{ name: "Evoque" }, { name: "Evoque R-Dynamic" }] },
    ],
  },
  {
    name: "Bentley",
    aliases: ["bentley"],
    models: [
      { name: "Continental GT", body: "coupe", yearStart: 2003, variants: [{ name: "Continental GT" }, { name: "GT V8" }, { name: "GT Speed" }] },
      { name: "Flying Spur", body: "sedan", yearStart: 2005, variants: [{ name: "Flying Spur" }, { name: "Flying Spur V8" }, { name: "Flying Spur Speed" }] },
      { name: "Bentayga", body: "suv", yearStart: 2015, variants: [{ name: "Bentayga" }, { name: "Bentayga V8" }, { name: "Bentayga Speed" }] },
    ],
  },
  {
    name: "Rolls-Royce",
    aliases: ["rollsroyce", "rolls", "royce"],
    models: [
      { name: "Phantom", body: "sedan", yearStart: 2003, variants: [{ name: "Phantom" }, { name: "Phantom EWB" }] },
      { name: "Ghost", body: "sedan", yearStart: 2009, variants: [{ name: "Ghost" }, { name: "Ghost EWB" }, { name: "Black Badge" }] },
      { name: "Wraith", body: "coupe", yearStart: 2013, yearEnd: 2023 },
      { name: "Dawn", body: "convertible", yearStart: 2015, yearEnd: 2023 },
      { name: "Cullinan", body: "suv", yearStart: 2018, variants: [{ name: "Cullinan" }, { name: "Black Badge" }] },
      { name: "Spectre", body: "coupe", yearStart: 2023 },
    ],
  },
  {
    name: "Ferrari",
    aliases: ["ferrari", "ferari"],
    models: [
      { name: "488", body: "sports", yearStart: 2015, yearEnd: 2019, variants: [{ name: "488 GTB" }, { name: "488 Spider" }, { name: "488 Pista" }] },
      { name: "F8", body: "sports", yearStart: 2019, yearEnd: 2023, variants: [{ name: "F8 Tributo" }, { name: "F8 Spider" }] },
      { name: "296", body: "sports", yearStart: 2021, variants: [{ name: "296 GTB" }, { name: "296 GTS" }] },
      { name: "SF90", body: "sports", yearStart: 2019, variants: [{ name: "SF90 Stradale" }, { name: "SF90 Spider" }] },
      { name: "Roma", body: "coupe", yearStart: 2020 },
      { name: "Portofino", body: "convertible", yearStart: 2017 },
      { name: "812", body: "coupe", yearStart: 2017, variants: [{ name: "812 Superfast" }, { name: "812 GTS" }, { name: "812 Competizione" }] },
      { name: "Purosangue", body: "suv", yearStart: 2022 },
      { name: "Roma Spider", body: "convertible", yearStart: 2023 },
    ],
  },
  {
    name: "Lamborghini",
    aliases: ["lamborghini", "lambo", "lamborghyni"],
    models: [
      { name: "Huracan", body: "sports", yearStart: 2014, variants: [{ name: "Huracan EVO" }, { name: "Huracan STO" }, { name: "Huracan Tecnica" }, { name: "Huracan Spyder" }] },
      { name: "Aventador", body: "sports", yearStart: 2011, yearEnd: 2022, variants: [{ name: "Aventador S" }, { name: "Aventador SVJ" }, { name: "Aventador Roadster" }] },
      { name: "Revuelto", body: "sports", yearStart: 2023 },
      { name: "Urus", body: "suv", yearStart: 2018, variants: [{ name: "Urus" }, { name: "Urus S" }, { name: "Urus Performante" }] },
    ],
  },
  {
    name: "McLaren",
    aliases: ["mclaren", "maclaren", "mclaran"],
    models: [
      { name: "540C", body: "sports", yearStart: 2015, yearEnd: 2021 },
      { name: "570S", body: "sports", yearStart: 2015, yearEnd: 2021 },
      { name: "570GT", body: "sports", yearStart: 2016, yearEnd: 2020 },
      { name: "600LT", body: "sports", yearStart: 2018, yearEnd: 2020, variants: [{ name: "600LT" }, { name: "600LT Spider" }] },
      { name: "620R", body: "sports", yearStart: 2020, yearEnd: 2021 },
      { name: "650S", body: "sports", yearStart: 2014, yearEnd: 2017, variants: [{ name: "650S Coupe" }, { name: "650S Spider" }] },
      { name: "675LT", body: "sports", yearStart: 2015, yearEnd: 2017 },
      { name: "720S", body: "sports", yearStart: 2017, yearEnd: 2023, variants: [{ name: "720S Coupe" }, { name: "720S Spider" }] },
      { name: "750S", body: "sports", yearStart: 2023, variants: [{ name: "750S Coupe" }, { name: "750S Spider" }] },
      { name: "765LT", body: "sports", yearStart: 2020, variants: [{ name: "765LT Coupe" }, { name: "765LT Spider" }] },
      { name: "Artura", body: "sports", yearStart: 2021, variants: [{ name: "Artura" }, { name: "Artura Spider", yearStart: 2024 }] },
      { name: "GT", body: "coupe", yearStart: 2019, yearEnd: 2023 },
      { name: "GTS", body: "coupe", yearStart: 2023 },
      { name: "Senna", body: "sports", yearStart: 2018, yearEnd: 2020 },
      { name: "Elva", body: "convertible", yearStart: 2020, yearEnd: 2021 },
      { name: "P1", body: "sports", yearStart: 2013, yearEnd: 2015 },
    ],
  },
  {
    name: "Maserati",
    aliases: ["maserati", "maseratti", "masarati", "maserrati"],
    models: [
      { name: "Ghibli", body: "sedan", yearStart: 2013, variants: [{ name: "Ghibli" }, { name: "Ghibli S" }, { name: "Ghibli Trofeo" }] },
      { name: "Quattroporte", body: "sedan", yearStart: 2003, variants: [{ name: "Quattroporte" }, { name: "Quattroporte S" }, { name: "Quattroporte Trofeo" }] },
      { name: "Levante", body: "suv", yearStart: 2016, variants: [{ name: "Levante" }, { name: "Levante S" }, { name: "Levante Trofeo" }] },
      { name: "Grecale", body: "suv", yearStart: 2022, variants: [{ name: "Grecale GT" }, { name: "Grecale Modena" }, { name: "Grecale Trofeo" }] },
      { name: "GranTurismo", body: "coupe", yearStart: 2007, variants: [{ name: "GranTurismo" }, { name: "Modena" }, { name: "Trofeo" }] },
      { name: "GranCabrio", body: "convertible", yearStart: 2010 },
      { name: "MC20", body: "sports", yearStart: 2020, variants: [{ name: "MC20 Coupe" }, { name: "MC20 Cielo" }] },
    ],
  },
  {
    name: "Aston Martin",
    aliases: ["astonmartin", "aston"],
    models: [
      { name: "Vantage", body: "sports", yearStart: 2005, variants: [{ name: "Vantage" }, { name: "V8 Vantage" }, { name: "V12 Vantage" }] },
      { name: "DB11", body: "coupe", yearStart: 2016, yearEnd: 2023 },
      { name: "DB12", body: "coupe", yearStart: 2023 },
      { name: "DBS", body: "coupe", yearStart: 2018 },
      { name: "DBX", body: "suv", yearStart: 2020, variants: [{ name: "DBX" }, { name: "DBX707" }] },
    ],
  },
  {
    name: "Jaguar",
    aliases: ["jaguar", "jag", "jaguer", "jagaur"],
    models: [
      { name: "XE", body: "sedan", yearStart: 2015, yearEnd: 2024 },
      { name: "XF", body: "sedan", yearStart: 2007 },
      { name: "XJ", body: "sedan", yearStart: 1968, yearEnd: 2019 },
      { name: "F-Type", body: "sports", yearStart: 2013, variants: [{ name: "F-Type P300" }, { name: "F-Type R" }] },
      { name: "E-PACE", body: "suv", yearStart: 2017 },
      { name: "F-PACE", body: "suv", yearStart: 2016, variants: [{ name: "F-PACE" }, { name: "F-PACE SVR" }] },
      { name: "I-PACE", body: "suv", yearStart: 2018 },
    ],
  },
  {
    name: "Volkswagen",
    aliases: ["volkswagen", "vw"],
    models: [
      { name: "Golf", body: "hatchback", yearStart: 1974, variants: [{ name: "Golf" }, { name: "Golf GTI" }, { name: "Golf R" }] },
      { name: "Polo", body: "hatchback", yearStart: 1975 },
      { name: "Passat", body: "sedan", yearStart: 1973 },
      { name: "Tiguan", body: "suv", yearStart: 2007 },
      { name: "Touareg", body: "suv", yearStart: 2002 },
      { name: "Teramont", body: "suv", yearStart: 2016 },
      { name: "ID.4", body: "suv", yearStart: 2020 },
    ],
  },
  {
    name: "Volvo",
    aliases: ["volvo"],
    models: [
      { name: "XC40", body: "suv", yearStart: 2017 },
      { name: "XC60", body: "suv", yearStart: 2008 },
      { name: "XC90", body: "suv", yearStart: 2002 },
      { name: "S60", body: "sedan", yearStart: 2000 },
      { name: "S90", body: "sedan", yearStart: 2016 },
      { name: "EX30", body: "suv", yearStart: 2023 },
      { name: "EX90", body: "suv", yearStart: 2023 },
    ],
  },
  {
    name: "MINI",
    aliases: ["mini"],
    models: [
      { name: "Cooper", body: "hatchback", yearStart: 2001, variants: [{ name: "Cooper" }, { name: "Cooper S" }, { name: "John Cooper Works" }] },
      { name: "Countryman", body: "suv", yearStart: 2010 },
      { name: "Clubman", body: "hatchback", yearStart: 2007 },
    ],
  },
  {
    name: "Toyota",
    aliases: ["toyota", "toyta", "toyoto"],
    models: [
      { name: "Land Cruiser", body: "suv", yearStart: 1951, variants: [{ name: "GXR" }, { name: "VXR" }, { name: "GR Sport" }] },
      { name: "Prado", body: "suv", yearStart: 1990, variants: [{ name: "TXL" }, { name: "VXL" }] },
      { name: "Fortuner", body: "suv", yearStart: 2004 },
      { name: "RAV4", body: "suv", yearStart: 1994 },
      { name: "Camry", body: "sedan", yearStart: 1982 },
      { name: "Corolla", body: "sedan", yearStart: 1966 },
      { name: "Hilux", body: "pickup", yearStart: 1968 },
      { name: "Supra", body: "sports", yearStart: 1978, variants: [{ name: "GR Supra 2.0" }, { name: "GR Supra 3.0" }] },
      { name: "Yaris", body: "hatchback", yearStart: 1999 },
      { name: "Highlander", body: "suv", yearStart: 2000 },
    ],
  },
  {
    name: "Lexus",
    aliases: ["lexus", "lexas"],
    models: [
      { name: "LX", body: "suv", yearStart: 1995, variants: [{ name: "LX 570" }, { name: "LX 600" }] },
      { name: "GX", body: "suv", yearStart: 2002, variants: [{ name: "GX 460" }, { name: "GX 550" }] },
      { name: "RX", body: "suv", yearStart: 1998, variants: [{ name: "RX 350" }, { name: "RX 500h" }] },
      { name: "NX", body: "suv", yearStart: 2014 },
      { name: "ES", body: "sedan", yearStart: 1989, variants: [{ name: "ES 300h" }, { name: "ES 350" }] },
      { name: "IS", body: "sedan", yearStart: 1999 },
      { name: "LS", body: "sedan", yearStart: 1989, variants: [{ name: "LS 500" }, { name: "LS 500h" }] },
      { name: "LC", body: "coupe", yearStart: 2016, variants: [{ name: "LC 500" }, { name: "LC 500h" }] },
    ],
  },
  {
    name: "Nissan",
    aliases: ["nissan", "nisan"],
    models: [
      { name: "Patrol", body: "suv", yearStart: 1951, variants: [{ name: "XE" }, { name: "SE" }, { name: "LE" }, { name: "Nismo" }] },
      { name: "X-Trail", body: "suv", yearStart: 2000 },
      { name: "Pathfinder", body: "suv", yearStart: 1985 },
      { name: "Altima", body: "sedan", yearStart: 1992 },
      { name: "Maxima", body: "sedan", yearStart: 1980 },
      { name: "GT-R", body: "sports", yearStart: 2007, variants: [{ name: "GT-R Premium" }, { name: "GT-R Nismo" }] },
      { name: "Navara", body: "pickup", yearStart: 1997 },
      { name: "Kicks", body: "suv", yearStart: 2016 },
    ],
  },
  {
    name: "Infiniti",
    aliases: ["infiniti", "infinity"],
    models: [
      { name: "Q50", body: "sedan", yearStart: 2013 },
      { name: "Q60", body: "coupe", yearStart: 2016 },
      { name: "QX50", body: "suv", yearStart: 2013 },
      { name: "QX60", body: "suv", yearStart: 2012 },
      { name: "QX80", body: "suv", yearStart: 2010 },
    ],
  },
  {
    name: "Ford",
    aliases: ["ford"],
    models: [
      { name: "Mustang", body: "coupe", yearStart: 1964, variants: [{ name: "EcoBoost" }, { name: "GT" }, { name: "Mach 1" }, { name: "Shelby GT500" }] },
      { name: "F-150", body: "pickup", yearStart: 1975, variants: [{ name: "XLT" }, { name: "Lariat" }, { name: "Raptor" }] },
      { name: "Explorer", body: "suv", yearStart: 1990 },
      { name: "Expedition", body: "suv", yearStart: 1996 },
      { name: "Ranger", body: "pickup", yearStart: 1983 },
      { name: "Bronco", body: "suv", yearStart: 2020 },
      { name: "Edge", body: "suv", yearStart: 2006 },
    ],
  },
  {
    name: "Chevrolet",
    aliases: ["chevrolet", "chevy"],
    models: [
      { name: "Tahoe", body: "suv", yearStart: 1994 },
      { name: "Suburban", body: "suv", yearStart: 1935 },
      { name: "Silverado", body: "pickup", yearStart: 1998 },
      { name: "Camaro", body: "coupe", yearStart: 1966, variants: [{ name: "LT" }, { name: "SS" }, { name: "ZL1" }] },
      { name: "Corvette", body: "sports", yearStart: 1953, variants: [{ name: "Stingray" }, { name: "Z06" }, { name: "E-Ray" }] },
      { name: "Malibu", body: "sedan", yearStart: 1964 },
      { name: "Traverse", body: "suv", yearStart: 2008 },
    ],
  },
  {
    name: "GMC",
    aliases: ["gmc"],
    models: [
      { name: "Yukon", body: "suv", yearStart: 1991, variants: [{ name: "SLT" }, { name: "Denali" }, { name: "AT4" }] },
      { name: "Sierra", body: "pickup", yearStart: 1998, variants: [{ name: "SLT" }, { name: "Denali" }, { name: "AT4" }] },
      { name: "Acadia", body: "suv", yearStart: 2006 },
      { name: "Terrain", body: "suv", yearStart: 2009 },
    ],
  },
  {
    name: "Cadillac",
    aliases: ["cadillac"],
    models: [
      { name: "Escalade", body: "suv", yearStart: 1998, variants: [{ name: "Escalade" }, { name: "Escalade-V" }] },
      { name: "XT4", body: "suv", yearStart: 2018 },
      { name: "XT5", body: "suv", yearStart: 2016 },
      { name: "XT6", body: "suv", yearStart: 2019 },
      { name: "CT4", body: "sedan", yearStart: 2019 },
      { name: "CT5", body: "sedan", yearStart: 2019 },
      { name: "Lyriq", body: "suv", yearStart: 2022 },
    ],
  },
  {
    name: "Jeep",
    aliases: ["jeep"],
    models: [
      { name: "Wrangler", body: "suv", yearStart: 1986, variants: [{ name: "Sport" }, { name: "Sahara" }, { name: "Rubicon" }] },
      { name: "Grand Cherokee", body: "suv", yearStart: 1992, variants: [{ name: "Limited" }, { name: "Overland" }, { name: "Summit" }, { name: "SRT" }, { name: "Trackhawk" }] },
      { name: "Cherokee", body: "suv", yearStart: 1974 },
      { name: "Gladiator", body: "pickup", yearStart: 2019 },
      { name: "Wagoneer", body: "suv", yearStart: 2021 },
    ],
  },
  {
    name: "Dodge",
    aliases: ["dodge"],
    models: [
      { name: "Charger", body: "sedan", yearStart: 2005, variants: [{ name: "SXT" }, { name: "R/T" }, { name: "Scat Pack" }, { name: "Hellcat" }] },
      { name: "Challenger", body: "coupe", yearStart: 2008, variants: [{ name: "SXT" }, { name: "R/T" }, { name: "Scat Pack" }, { name: "Hellcat" }] },
      { name: "Durango", body: "suv", yearStart: 1997, variants: [{ name: "GT" }, { name: "R/T" }, { name: "SRT" }] },
    ],
  },
  {
    name: "RAM",
    aliases: ["ram", "dodgeram"],
    models: [
      { name: "1500", body: "pickup", yearStart: 2010, variants: [{ name: "Big Horn" }, { name: "Laramie" }, { name: "Limited" }, { name: "TRX" }] },
      { name: "2500", body: "pickup", yearStart: 2010 },
    ],
  },
  {
    name: "Tesla",
    aliases: ["tesla"],
    models: [
      { name: "Model 3", body: "sedan", yearStart: 2017, variants: [{ name: "Standard Range" }, { name: "Long Range" }, { name: "Performance" }] },
      { name: "Model Y", body: "suv", yearStart: 2020, variants: [{ name: "Long Range" }, { name: "Performance" }] },
      { name: "Model S", body: "sedan", yearStart: 2012, variants: [{ name: "Long Range" }, { name: "Plaid" }] },
      { name: "Model X", body: "suv", yearStart: 2015, variants: [{ name: "Long Range" }, { name: "Plaid" }] },
      { name: "Cybertruck", body: "pickup", yearStart: 2023 },
    ],
  },
]

/* ============================ HELPERS ============================ */

function normalize(s: string | null | undefined): string {
  return (s || "").toLowerCase().replace(/[^a-z0-9]/g, "")
}

function makeMatches(def: CatalogMake, key: string): boolean {
  if (!key) return false
  if (normalize(def.name) === key) return true
  return (def.aliases || []).some((a) => normalize(a) === key)
}

export function findCatalogMake(make: string | null | undefined): CatalogMake | undefined {
  const key = normalize(make)
  if (!key) return undefined
  return (
    VEHICLE_CATALOG.find((m) => makeMatches(m, key)) ||
    // contains match for compound inputs like "mercedes benz amg"
    VEHICLE_CATALOG.find((m) => normalize(m.name).includes(key) || (m.aliases || []).some((a) => key.includes(normalize(a))))
  )
}

/** All catalog make names, sorted alphabetically. */
export function catalogMakeNames(): string[] {
  return VEHICLE_CATALOG.map((m) => m.name).sort((a, b) => a.localeCompare(b))
}

function inProduction(model: CatalogModel | CatalogVariant, year: number, baseStart?: number, baseEnd?: number | null): boolean {
  const start = (model as CatalogModel).yearStart ?? (model as CatalogVariant).yearStart ?? baseStart ?? 0
  const rawEnd = (model as any).yearEnd
  const end = rawEnd === undefined ? (baseEnd === undefined ? MAX_YEAR : baseEnd ?? MAX_YEAR) : rawEnd ?? MAX_YEAR
  return year >= start && year <= end
}

/**
 * Model names available for a make, filtered to a given year when provided.
 * Falls back to all models for the make when no (or an out-of-range) year is set.
 */
export function modelsForYear(make: string | null | undefined, year?: number | null): string[] {
  const def = findCatalogMake(make)
  if (!def) return []
  const y = year && year >= 1950 && year <= MAX_YEAR ? year : null
  const list = y ? def.models.filter((m) => inProduction(m, y)) : def.models
  // De-dupe by name, preserve first occurrence order, then sort.
  const seen = new Set<string>()
  const names: string[] = []
  for (const m of list) {
    if (!seen.has(m.name)) {
      seen.add(m.name)
      names.push(m.name)
    }
  }
  return names.sort((a, b) => a.localeCompare(b))
}

function findModelDef(def: CatalogMake, model: string | null | undefined): CatalogModel | undefined {
  const key = normalize(model)
  if (!key) return undefined
  return def.models.find((m) => normalize(m.name) === key) || def.models.find((m) => normalize(m.name).includes(key) || key.includes(normalize(m.name)))
}

/** Variant/trim names for a make+model, filtered by year when provided. */
export function variantsForModelYear(
  make: string | null | undefined,
  model: string | null | undefined,
  year?: number | null,
): string[] {
  const def = findCatalogMake(make)
  if (!def) return []
  const md = findModelDef(def, model)
  if (!md || !md.variants) return []
  const y = year && year >= 1950 && year <= MAX_YEAR ? year : null
  const list = y ? md.variants.filter((v) => inProduction(v, y, md.yearStart, md.yearEnd)) : md.variants
  return list.map((v) => v.name)
}

/** Body style for a known make+model, else undefined. */
export function catalogBodyType(make: string | null | undefined, model: string | null | undefined): BodyType | undefined {
  const def = findCatalogMake(make)
  if (!def) return undefined
  return findModelDef(def, model)?.body
}

export type CatalogSearchResult = {
  make: string
  model: string
  variant?: string
  body: BodyType
  yearStart: number
  yearEnd: number | null
  label: string // "Mercedes-Benz SL 63 AMG"
  sublabel: string // "Convertible · 2021–present"
}

/**
 * Free-text search across makes/models/variants. Handles compact queries like
 * "SL63" -> "Mercedes-Benz SL 63 AMG", "720S" -> "McLaren 720S", "S580" ->
 * "Mercedes-Benz S 580" (+ Maybach S 580). Ranked: variant hits, then model
 * hits, prefix matches before contains matches.
 */
export function searchCatalog(query: string, limit = 12): CatalogSearchResult[] {
  const q = normalize(query)
  if (q.length < 2) return []
  const scored: { score: number; r: CatalogSearchResult }[] = []

  for (const make of VEHICLE_CATALOG) {
    const makeKey = normalize(make.name)
    for (const model of make.models) {
      const modelKey = normalize(model.name)
      const yearEnd = model.yearEnd === undefined ? MAX_YEAR : model.yearEnd ?? MAX_YEAR
      const span = `${model.yearStart}\u2013${model.yearEnd == null ? "present" : model.yearEnd}`
      const bodyLabel = BODY_LABEL[model.body]

      // Variant-level matches (most specific).
      for (const v of model.variants || []) {
        const vKey = normalize(v.name)
        const combined = makeKey + vKey
        const score = matchScore(q, vKey) || matchScore(q, combined) || matchScore(q, modelKey + vKey)
        if (score > 0) {
          const vEnd = v.yearEnd === undefined ? yearEnd : v.yearEnd ?? MAX_YEAR
          scored.push({
            score: score + 2,
            r: {
              make: make.name,
              model: model.name,
              variant: v.name,
              body: model.body,
              yearStart: v.yearStart ?? model.yearStart,
              yearEnd: vEnd >= MAX_YEAR ? null : vEnd,
              label: `${make.name} ${v.name}`,
              sublabel: `${bodyLabel} \u00b7 ${span}`,
            },
          })
        }
      }

      // Model-level match.
      const mScore = matchScore(q, modelKey) || matchScore(q, makeKey + modelKey)
      if (mScore > 0) {
        scored.push({
          score: mScore,
          r: {
            make: make.name,
            model: model.name,
            body: model.body,
            yearStart: model.yearStart,
            yearEnd: model.yearEnd == null ? null : model.yearEnd,
            label: `${make.name} ${model.name}`,
            sublabel: `${bodyLabel} \u00b7 ${span}`,
          },
        })
      }
    }
  }

  scored.sort((a, b) => b.score - a.score)
  // De-dupe identical labels.
  const seen = new Set<string>()
  const out: CatalogSearchResult[] = []
  for (const s of scored) {
    if (seen.has(s.r.label)) continue
    seen.add(s.r.label)
    out.push(s.r)
    if (out.length >= limit) break
  }
  return out
}

// Higher = better. Prefix > contains; ignores no match.
function matchScore(q: string, target: string): number {
  if (!target) return 0
  if (target === q) return 6
  if (target.startsWith(q)) return 4
  if (target.includes(q)) return 2
  return 0
}

const BODY_LABEL: Record<BodyType, string> = {
  sedan: "Sedan",
  suv: "SUV",
  coupe: "Coupe",
  convertible: "Convertible",
  hatchback: "Hatchback",
  pickup: "Pickup",
  van: "Van",
  sports: "Sports Car",
}

/** The default year to preselect for a search result (most recent in range). */
export function defaultYearFor(r: CatalogSearchResult): number {
  return r.yearEnd == null ? CURRENT_YEAR : Math.min(r.yearEnd, CURRENT_YEAR)
}

/** Year options (descending) for the picker, capped to a model's range if known. */
export function yearOptions(make?: string | null, model?: string | null): number[] {
  let start = 1980
  let end = MAX_YEAR
  const def = findCatalogMake(make)
  const md = def ? findModelDef(def, model) : undefined
  if (md) {
    start = Math.max(1950, md.yearStart)
    end = md.yearEnd == null ? MAX_YEAR : Math.min(MAX_YEAR, md.yearEnd)
  }
  const years: number[] = []
  for (let y = end; y >= start; y--) years.push(y)
  return years
}
