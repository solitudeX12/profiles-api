const axios = require("axios");

const TIMEOUT = 4500;

async function fetchGenderize(name) {
  try {
    const { data } = await axios.get("https://api.genderize.io", {
      params: { name },
      timeout: TIMEOUT,
    });

    if (!data.gender || data.count === 0) {
      throw new Error("Genderize returned an invalid response");
    }

    return {
      gender: data.gender,
      gender_probability: data.probability,
      sample_size: data.count,
    };
  } catch (err) {
    if (err.message.includes("Genderize")) throw err;
    throw new Error("Genderize returned an invalid response");
  }
}

async function fetchAgify(name) {
  try {
    const { data } = await axios.get("https://api.agify.io", {
      params: { name },
      timeout: TIMEOUT,
    });

    if (data.age === null || data.age === undefined) {
      throw new Error("Agify returned an invalid response");
    }

    return { age: data.age };
  } catch (err) {
    if (err.message.includes("Agify")) throw err;
    throw new Error("Agify returned an invalid response");
  }
}

async function fetchNationalize(name) {
  try {
    const { data } = await axios.get("https://api.nationalize.io", {
      params: { name },
      timeout: TIMEOUT,
    });

    if (!data.country || data.country.length === 0) {
      throw new Error("Nationalize returned an invalid response");
    }

    // Pick country with highest probability
    const top = data.country.reduce((a, b) =>
      a.probability >= b.probability ? a : b
    );

    return {
      country_id: top.country_id,
      country_probability: top.probability,
    };
  } catch (err) {
    if (err.message.includes("Nationalize")) throw err;
    throw new Error("Nationalize returned an invalid response");
  }
}

module.exports = { fetchGenderize, fetchAgify, fetchNationalize };
