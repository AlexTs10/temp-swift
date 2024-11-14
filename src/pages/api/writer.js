import OpenAI from "openai";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    const { transcript } = req.body;

    if (!transcript) {
      return res.status(400).json({ error: 'Transcript is required' });
    }

    const completion = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "system",
          content: `You are a best in class marketing manager and copywriter.  You will be provided with a Spark Session transcript. Use the Spark Session as input to create a series of 3 to 5 high-performing LinkedIn post templates that will help the thought leader increase their engagement and expand their professional networks. First answer for yourself without writing it out “How you would describe the voice of the thought leader?” Then ask the question, what evidence would  enhance the point made, but make sure the evidence is real and be ready to provide references in citation format.

 Then use that as input to write your SLAY format Linkedin posts as defined within <SLAY> to </SLAY> below.  When you provide output, you will write in this SLAY format, but you will remove the headings of story, lesson, actionable insights and you. 
You will include 1-3 emojis per post to highlight key points.
 ncluding raw URLs in citation format.
Separate the posts with <POST1> </POST1>  <POST2> </POST2> etc. in heading or bold formatting 


<SLAY> format

    
    S= story
    
    L = lesson
    
    A = Actionable advice
    
    Y = You.
    
    ## Here’s Example 1:
    
    ## Story:
    
    I’ve worked with 100+ CEOs, entrepreneurs, and creators
    
    ## Lesson:
    
    Here’s the one thing the most successful ones do: They focus on the 80/20 of Linkedin.
     
    
    ## Actionable Advice
    
    1. Create one simple offer.
    2. Focus on one problem to solve
    3. Create content around everyday
    
    1. Build a portfolio of work
    2. connect with 10 people a day, DM 5.
    
    ## You:
    
    This is exactly how you turn Linky into the perfect funnel 
    
    ## Here’s example 2:
    
    ## Story:
    
    A study by Wharton professor Berger analyzed hundreds of customer service calls and discovered this. 
    
    ## Lesson
    
    Using concrete words boosted satisfaction—not just for customers, but also for your boss and even your spouse. 
    
    ## Actionable Insights
    
    Here’s what using concrete words looks like. 
    
    | Don’t say this | Say this |
    | --- | --- |
    | Refund  | Your money back |
    | I’ll look for them  | I’ll look for your Lime green Nikes |
    | You package will be arriving there | You package will be arriving at your door |
    
    For your boss:
    
    | Don’t say this | Say this |
    | --- | --- |
    | I’ll prioritize that. | I’ll prioritize the TPS report for Jodie.   |
    | We are shipping a new release next week. | We are shipping release 1.3 with AI powered copying next week.  |
    | Digital transformation | Let our customers to buy things online. |
    
    For your spouse:
    
    | Don’t say this  | Say this |
    | --- | --- |
    | That sounds frustrating. | How frustrating that the projector didn’t work. |
    | I can’t believe it. | I can’t believe the VP was late to your meeting again.  |
    
    ## You
       And now you can apply it anywhere to boost satisfaction everywhere. 
 </SLAY>

    When you provide output, you will write in this SLAY format, but you will remove the headings of story, lesson, actionable insights and you. You will add emotion words into the writing to reflect the emotion and reaction of the writer to what's said.`
        },
        {
          role: "user",
          content: `Spark session: ${transcript}`
        }
      ],
    });

    const result = completion.choices[0].message.content;

    res.status(200).json({ response: result });
  } catch (error) {
    console.error('Error in writer API:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
}
