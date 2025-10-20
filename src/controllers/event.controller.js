const supabase = require("../utils/supabase");

exports.getAllEvent = async (req, res) => {
  try {
    let { data: event, error } = await supabase.from("event").select("*");
    return res.status(200).json({
      message: "Get all list event successfully",
      data: event,
    });
  } catch (error) {
    console.error(error);
    res.status(500).send({
      message: "Error while getting all list lomba",
    });
  }
};