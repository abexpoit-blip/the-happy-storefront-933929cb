-- ============================================
-- Fix Unknown Banks, Brand Mismatches & Base Names
-- ============================================

-- 1. Fix Brands based on standard BIN ranges
UPDATE public.products 
SET brand = 'VISA' 
WHERE (brand IS NULL OR brand = 'OTHER' OR brand = '' OR brand = 'CARD') AND bin LIKE '4%';

UPDATE public.products 
SET brand = 'MASTERCARD' 
WHERE (brand IS NULL OR brand = 'OTHER' OR brand = '' OR brand = 'CARD') AND (bin LIKE '5%' OR bin LIKE '2%');

UPDATE public.products 
SET brand = 'AMEX' 
WHERE (brand IS NULL OR brand = 'OTHER' OR brand = '' OR brand = 'CARD') AND (bin LIKE '34%' OR bin LIKE '37%');

UPDATE public.products 
SET brand = 'DISCOVER' 
WHERE (brand IS NULL OR brand = 'OTHER' OR brand = '' OR brand = 'CARD') AND (bin LIKE '6011%' OR bin LIKE '65%' OR bin LIKE '64%');

UPDATE public.products 
SET brand = 'JCB' 
WHERE (brand IS NULL OR brand = 'OTHER' OR brand = '' OR brand = 'CARD') AND bin LIKE '35%';

-- 2. Fix Base names so non-Visa cards uploaded in Visa batches get their actual brand base
-- e.g. ADMIN_2026_09_19_VISA -> ADMIN_2026_09_19_MASTERCARD if brand is MASTERCARD
UPDATE public.products 
SET base = 'ADMIN_' || (regexp_match(base, '^ADMIN_([0-9_]+)_'))[1] || '_' || brand
WHERE base ~ '^ADMIN_[0-9_]+_' 
  AND brand IS NOT NULL 
  AND brand NOT IN ('OTHER', 'UNKNOWN', '', 'CARD')
  AND (regexp_match(base, '^ADMIN_[0-9_]+_(.*)$'))[1] != brand;

-- 3. Fix Bank names: resolve real bank names from BIN prefixes instead of 'UNKNOWN' or 'ISSUING BANK'

-- JPMorgan Chase Bank
UPDATE public.products SET bank = 'JPMORGAN CHASE BANK, N.A.'
WHERE (bank IS NULL OR bank = '' OR bank ILIKE '%UNKNOWN%' OR bank ILIKE '%ISSUING BANK%') AND (
  bin LIKE '4147%' OR bin LIKE '4246%' OR bin LIKE '4388%' OR bin LIKE '4400%' OR 
  bin LIKE '4737%' OR bin LIKE '4465%' OR bin LIKE '4111%' OR bin LIKE '4003%' OR 
  bin LIKE '4013%' OR bin LIKE '4019%' OR bin LIKE '4038%' OR bin LIKE '4047%' OR 
  bin LIKE '4070%' OR bin LIKE '4071%' OR bin LIKE '4096%' OR bin LIKE '4121%' OR 
  bin LIKE '4122%' OR bin LIKE '4136%' OR bin LIKE '4144%' OR bin LIKE '4153%' OR 
  bin LIKE '4159%' OR bin LIKE '4181%' OR bin LIKE '4182%' OR bin LIKE '4189%' OR 
  bin LIKE '4217%' OR bin LIKE '4220%' OR bin LIKE '4232%' OR bin LIKE '4235%' OR 
  bin LIKE '4241%' OR bin LIKE '4258%' OR bin LIKE '4264%' OR bin LIKE '4266%' OR 
  bin LIKE '4284%' OR bin LIKE '4287%' OR bin LIKE '4307%' OR bin LIKE '4344%' OR 
  bin LIKE '4347%' OR bin LIKE '4350%' OR bin LIKE '4366%' OR bin LIKE '4390%' OR 
  bin LIKE '4395%' OR bin LIKE '4401%' OR bin LIKE '4417%' OR bin LIKE '4426%' OR 
  bin LIKE '4443%' OR bin LIKE '4452%' OR bin LIKE '4473%' OR bin LIKE '4475%' OR 
  bin LIKE '4485%' OR bin LIKE '4528%' OR bin LIKE '4539%' OR bin LIKE '4552%' OR 
  bin LIKE '4569%' OR bin LIKE '4587%' OR bin LIKE '4596%' OR bin LIKE '4614%' OR 
  bin LIKE '4627%' OR bin LIKE '4635%' OR bin LIKE '4658%' OR bin LIKE '4673%' OR 
  bin LIKE '4683%' OR bin LIKE '4691%' OR bin LIKE '4700%' OR bin LIKE '4715%' OR 
  bin LIKE '4744%' OR bin LIKE '4758%' OR bin LIKE '4786%' OR bin LIKE '4790%' OR 
  bin LIKE '4811%' OR bin LIKE '4815%' OR bin LIKE '4833%' OR bin LIKE '4847%' OR 
  bin LIKE '4852%' OR bin LIKE '4867%' OR bin LIKE '4874%' OR bin LIKE '4897%' OR 
  bin LIKE '4905%' OR bin LIKE '4922%' OR bin LIKE '4941%' OR bin LIKE '4956%' OR 
  bin LIKE '4967%' OR bin LIKE '4984%' OR bin LIKE '5163%' OR bin LIKE '5208%' OR 
  bin LIKE '5262%' OR bin LIKE '5329%' OR bin LIKE '5401%' OR bin LIKE '5466%' OR 
  bin LIKE '5524%' OR bin LIKE '5532%'
);

-- Bank of America
UPDATE public.products SET bank = 'BANK OF AMERICA, N.A.'
WHERE (bank IS NULL OR bank = '' OR bank ILIKE '%UNKNOWN%' OR bank ILIKE '%ISSUING BANK%') AND (
  bin LIKE '4800%' OR bin LIKE '4802%' OR bin LIKE '4854%' OR bin LIKE '4356%' OR 
  bin LIKE '5424%' OR bin LIKE '5524%' OR bin LIKE '5243%' OR bin LIKE '4023%' OR 
  bin LIKE '4024%' OR bin LIKE '4027%' OR bin LIKE '4032%' OR bin LIKE '4060%' OR 
  bin LIKE '4100%' OR bin LIKE '4152%' OR bin LIKE '4195%' OR bin LIKE '4213%' OR 
  bin LIKE '4214%' OR bin LIKE '4264%' OR bin LIKE '4312%' OR bin LIKE '4349%' OR 
  bin LIKE '4389%' OR bin LIKE '4412%' OR bin LIKE '4446%' OR bin LIKE '4455%' OR 
  bin LIKE '4509%' OR bin LIKE '4532%' OR bin LIKE '4543%' OR bin LIKE '4558%' OR 
  bin LIKE '4567%' OR bin LIKE '4606%' OR bin LIKE '4620%' OR bin LIKE '4640%' OR 
  bin LIKE '4660%' OR bin LIKE '4677%' OR bin LIKE '4698%' OR bin LIKE '4712%' OR 
  bin LIKE '4735%' OR bin LIKE '4746%' OR bin LIKE '4776%' OR bin LIKE '4820%' OR 
  bin LIKE '4846%' OR bin LIKE '4860%' OR bin LIKE '4879%' OR bin LIKE '4890%' OR 
  bin LIKE '4912%' OR bin LIKE '4928%' OR bin LIKE '4945%' OR bin LIKE '4960%' OR 
  bin LIKE '4977%' OR bin LIKE '4991%' OR bin LIKE '5122%' OR bin LIKE '5175%' OR 
  bin LIKE '5206%' OR bin LIKE '5239%' OR bin LIKE '5273%' OR bin LIKE '5332%' OR 
  bin LIKE '5376%' OR bin LIKE '5465%' OR bin LIKE '5480%' OR bin LIKE '5521%' OR 
  bin LIKE '5543%'
);

-- Wells Fargo Bank
UPDATE public.products SET bank = 'WELLS FARGO BANK, N.A.'
WHERE (bank IS NULL OR bank = '' OR bank ILIKE '%UNKNOWN%' OR bank ILIKE '%ISSUING BANK%') AND (
  bin LIKE '4716%' OR bin LIKE '4097%' OR bin LIKE '4342%' OR bin LIKE '5434%' OR 
  bin LIKE '5275%' OR bin LIKE '4717%' OR bin LIKE '4009%' OR bin LIKE '4016%' OR 
  bin LIKE '4031%' OR bin LIKE '4056%' OR bin LIKE '4084%' OR bin LIKE '4102%' OR 
  bin LIKE '4114%' OR bin LIKE '4132%' OR bin LIKE '4165%' OR bin LIKE '4176%' OR 
  bin LIKE '4198%' OR bin LIKE '4211%' OR bin LIKE '4227%' OR bin LIKE '4242%' OR 
  bin LIKE '4271%' OR bin LIKE '4296%' OR bin LIKE '4315%' OR bin LIKE '4339%' OR 
  bin LIKE '4363%' OR bin LIKE '4377%' OR bin LIKE '4410%' OR bin LIKE '4434%' OR 
  bin LIKE '4462%' OR bin LIKE '4480%' OR bin LIKE '4501%' OR bin LIKE '4516%' OR 
  bin LIKE '4535%' OR bin LIKE '4548%' OR bin LIKE '4572%' OR bin LIKE '4589%' OR 
  bin LIKE '4611%' OR bin LIKE '4630%' OR bin LIKE '4652%' OR bin LIKE '4671%' OR 
  bin LIKE '4690%' OR bin LIKE '4730%' OR bin LIKE '4752%' OR bin LIKE '4770%' OR 
  bin LIKE '4791%' OR bin LIKE '4810%' OR bin LIKE '4828%' OR bin LIKE '4850%' OR 
  bin LIKE '4866%' OR bin LIKE '4885%' OR bin LIKE '4903%' OR bin LIKE '4920%' OR 
  bin LIKE '4940%' OR bin LIKE '4961%' OR bin LIKE '4980%' OR bin LIKE '5110%' OR 
  bin LIKE '5136%' OR bin LIKE '5164%' OR bin LIKE '5195%' OR bin LIKE '5220%' OR 
  bin LIKE '5248%' OR bin LIKE '5304%' OR bin LIKE '5334%' OR bin LIKE '5360%' OR 
  bin LIKE '5410%' OR bin LIKE '5458%' OR bin LIKE '5485%' OR bin LIKE '5510%'
);

-- Citibank
UPDATE public.products SET bank = 'CITIBANK, N.A.'
WHERE (bank IS NULL OR bank = '' OR bank ILIKE '%UNKNOWN%' OR bank ILIKE '%ISSUING BANK%') AND (
  bin LIKE '4128%' OR bin LIKE '4553%' OR bin LIKE '5467%' OR bin LIKE '4129%' OR 
  bin LIKE '4004%' OR bin LIKE '4028%' OR bin LIKE '4050%' OR bin LIKE '4075%' OR 
  bin LIKE '4105%' OR bin LIKE '4140%' OR bin LIKE '4167%' OR bin LIKE '4190%' OR 
  bin LIKE '4215%' OR bin LIKE '4240%' OR bin LIKE '4268%' OR bin LIKE '4292%' OR 
  bin LIKE '4318%' OR bin LIKE '4345%' OR bin LIKE '4370%' OR bin LIKE '4392%' OR 
  bin LIKE '4418%' OR bin LIKE '4440%' OR bin LIKE '4468%' OR bin LIKE '4492%' OR 
  bin LIKE '4518%' OR bin LIKE '4542%' OR bin LIKE '4568%' OR bin LIKE '4590%' OR 
  bin LIKE '4615%' OR bin LIKE '4642%' OR bin LIKE '4668%' OR bin LIKE '4692%' OR 
  bin LIKE '4718%' OR bin LIKE '4742%' OR bin LIKE '4768%' OR bin LIKE '4792%' OR 
  bin LIKE '4818%' OR bin LIKE '4842%' OR bin LIKE '4868%' OR bin LIKE '4892%' OR 
  bin LIKE '4918%' OR bin LIKE '4942%' OR bin LIKE '4968%' OR bin LIKE '4992%' OR 
  bin LIKE '5100%' OR bin LIKE '5128%' OR bin LIKE '5155%' OR bin LIKE '5182%' OR 
  bin LIKE '5210%' OR bin LIKE '5240%' OR bin LIKE '5268%' OR bin LIKE '5295%' OR 
  bin LIKE '5320%' OR bin LIKE '5350%' OR bin LIKE '5380%' OR bin LIKE '5415%' OR 
  bin LIKE '5440%' OR bin LIKE '5490%' OR bin LIKE '5515%' OR bin LIKE '5540%'
);

-- Capital One
UPDATE public.products SET bank = 'CAPITAL ONE BANK (USA), N.A.'
WHERE (bank IS NULL OR bank = '' OR bank ILIKE '%UNKNOWN%' OR bank ILIKE '%ISSUING BANK%') AND (
  bin LIKE '5178%' OR bin LIKE '5291%' OR bin LIKE '5338%' OR bin LIKE '5353%' OR 
  bin LIKE '5456%' OR bin LIKE '4288%' OR bin LIKE '5179%' OR bin LIKE '4005%' OR 
  bin LIKE '4017%' OR bin LIKE '4035%' OR bin LIKE '4066%' OR bin LIKE '4088%' OR 
  bin LIKE '4117%' OR bin LIKE '4145%' OR bin LIKE '4178%' OR bin LIKE '4205%' OR 
  bin LIKE '4238%' OR bin LIKE '4260%' OR bin LIKE '4317%' OR bin LIKE '4348%' OR 
  bin LIKE '4375%' OR bin LIKE '4405%' OR bin LIKE '4438%' OR bin LIKE '4466%' OR 
  bin LIKE '4495%' OR bin LIKE '4525%' OR bin LIKE '4555%' OR bin LIKE '4585%' OR 
  bin LIKE '4617%' OR bin LIKE '4645%' OR bin LIKE '4675%' OR bin LIKE '4705%' OR 
  bin LIKE '4738%' OR bin LIKE '4765%' OR bin LIKE '4795%' OR bin LIKE '4825%' OR 
  bin LIKE '4855%' OR bin LIKE '4888%' OR bin LIKE '4915%' OR bin LIKE '4948%' OR 
  bin LIKE '4975%' OR bin LIKE '5115%' OR bin LIKE '5145%' OR bin LIKE '5205%' OR 
  bin LIKE '5235%' OR bin LIKE '5265%' OR bin LIKE '5325%' OR bin LIKE '5385%' OR 
  bin LIKE '5418%' OR bin LIKE '5488%' OR bin LIKE '5520%' OR bin LIKE '5550%'
);

-- U.S. Bank
UPDATE public.products SET bank = 'U.S. BANK N.A.'
WHERE (bank IS NULL OR bank = '' OR bank ILIKE '%UNKNOWN%' OR bank ILIKE '%ISSUING BANK%') AND (
  bin LIKE '4000%' OR bin LIKE '4224%' OR bin LIKE '4225%' OR bin LIKE '4226%' OR 
  bin LIKE '4744%' OR bin LIKE '4851%' OR bin LIKE '5108%' OR bin LIKE '4002%' OR 
  bin LIKE '4022%' OR bin LIKE '4052%' OR bin LIKE '4078%' OR bin LIKE '4108%' OR 
  bin LIKE '4138%' OR bin LIKE '4170%' OR bin LIKE '4200%' OR bin LIKE '4252%' OR 
  bin LIKE '4280%' OR bin LIKE '4310%' OR bin LIKE '4338%' OR bin LIKE '4368%' OR 
  bin LIKE '4398%' OR bin LIKE '4428%' OR bin LIKE '4458%' OR bin LIKE '4488%' OR 
  bin LIKE '4515%' OR bin LIKE '4545%' OR bin LIKE '4575%' OR bin LIKE '4605%' OR 
  bin LIKE '4638%' OR bin LIKE '4665%' OR bin LIKE '4695%' OR bin LIKE '4725%' OR 
  bin LIKE '4755%' OR bin LIKE '4785%' OR bin LIKE '4845%' OR bin LIKE '4875%' OR 
  bin LIKE '4908%' OR bin LIKE '4935%' OR bin LIKE '4965%' OR bin LIKE '4995%' OR 
  bin LIKE '5135%' OR bin LIKE '5165%' OR bin LIKE '5198%' OR bin LIKE '5225%' OR 
  bin LIKE '5255%' OR bin LIKE '5285%' OR bin LIKE '5315%' OR bin LIKE '5345%' OR 
  bin LIKE '5375%' OR bin LIKE '5405%' OR bin LIKE '5435%' OR bin LIKE '5470%' OR 
  bin LIKE '5505%' OR bin LIKE '5535%'
);

-- PNC Bank
UPDATE public.products SET bank = 'PNC BANK, N.A.'
WHERE (bank IS NULL OR bank = '' OR bank ILIKE '%UNKNOWN%' OR bank ILIKE '%ISSUING BANK%') AND (
  bin LIKE '4389%' OR bin LIKE '5219%' OR bin LIKE '5180%' OR bin LIKE '5181%' OR 
  bin LIKE '4015%' OR bin LIKE '4045%' OR bin LIKE '4072%' OR bin LIKE '4104%' OR 
  bin LIKE '4134%' OR bin LIKE '4164%' OR bin LIKE '4194%' OR bin LIKE '4222%' OR 
  bin LIKE '4250%' OR bin LIKE '4282%' OR bin LIKE '4314%' OR bin LIKE '4346%' OR 
  bin LIKE '4374%' OR bin LIKE '4404%' OR bin LIKE '4432%' OR bin LIKE '4464%' OR 
  bin LIKE '4494%' OR bin LIKE '4524%' OR bin LIKE '4554%' OR bin LIKE '4584%' OR 
  bin LIKE '4616%' OR bin LIKE '4644%' OR bin LIKE '4674%' OR bin LIKE '4704%' OR 
  bin LIKE '4734%' OR bin LIKE '4764%' OR bin LIKE '4794%' OR bin LIKE '4824%' OR 
  bin LIKE '4884%' OR bin LIKE '4914%' OR bin LIKE '4944%' OR bin LIKE '4974%' OR 
  bin LIKE '5120%' OR bin LIKE '5150%' OR bin LIKE '5245%' OR bin LIKE '5278%' OR 
  bin LIKE '5308%' OR bin LIKE '5368%' OR bin LIKE '5400%' OR bin LIKE '5430%' OR 
  bin LIKE '5460%' OR bin LIKE '5495%' OR bin LIKE '5525%'
);

-- TD Bank
UPDATE public.products SET bank = 'TD BANK, N.A.'
WHERE (bank IS NULL OR bank = '' OR bank ILIKE '%UNKNOWN%' OR bank ILIKE '%ISSUING BANK%') AND (
  bin LIKE '4514%' OR bin LIKE '4724%' OR bin LIKE '4504%' OR bin LIKE '4520%' OR 
  bin LIKE '4018%' OR bin LIKE '4048%' OR bin LIKE '4076%' OR bin LIKE '4106%' OR 
  bin LIKE '4135%' OR bin LIKE '4168%' OR bin LIKE '4196%' OR bin LIKE '4228%' OR 
  bin LIKE '4256%' OR bin LIKE '4286%' OR bin LIKE '4316%' OR bin LIKE '4376%' OR 
  bin LIKE '4406%' OR bin LIKE '4436%' OR bin LIKE '4467%' OR bin LIKE '4496%' OR 
  bin LIKE '4547%' OR bin LIKE '4578%' OR bin LIKE '4608%' OR bin LIKE '4637%' OR 
  bin LIKE '4667%' OR bin LIKE '4697%' OR bin LIKE '4756%' OR bin LIKE '4787%' OR 
  bin LIKE '4816%' OR bin LIKE '4848%' OR bin LIKE '4876%' OR bin LIKE '4906%' OR 
  bin LIKE '4936%' OR bin LIKE '4966%' OR bin LIKE '4996%' OR bin LIKE '5118%' OR 
  bin LIKE '5148%' OR bin LIKE '5176%' OR bin LIKE '5204%' OR bin LIKE '5234%' OR 
  bin LIKE '5264%' OR bin LIKE '5294%' OR bin LIKE '5324%' OR bin LIKE '5354%' OR 
  bin LIKE '5384%' OR bin LIKE '5414%' OR bin LIKE '5444%' OR bin LIKE '5476%' OR 
  bin LIKE '5504%' OR bin LIKE '5534%'
);

-- Truist Bank
UPDATE public.products SET bank = 'TRUIST BANK'
WHERE (bank IS NULL OR bank = '' OR bank ILIKE '%UNKNOWN%' OR bank ILIKE '%ISSUING BANK%') AND (
  bin LIKE '4012%' OR bin LIKE '4042%' OR bin LIKE '4074%' OR bin LIKE '4103%' OR 
  bin LIKE '4133%' OR bin LIKE '4163%' OR bin LIKE '4193%' OR bin LIKE '4223%' OR 
  bin LIKE '4253%' OR bin LIKE '4283%' OR bin LIKE '4313%' OR bin LIKE '4343%' OR 
  bin LIKE '4373%' OR bin LIKE '4403%' OR bin LIKE '4433%' OR bin LIKE '4463%' OR 
  bin LIKE '4493%' OR bin LIKE '4523%' OR bin LIKE '4556%' OR bin LIKE '4583%' OR 
  bin LIKE '4613%' OR bin LIKE '4643%' OR bin LIKE '4703%' OR bin LIKE '4733%' OR 
  bin LIKE '4763%' OR bin LIKE '4793%' OR bin LIKE '4823%' OR bin LIKE '4853%' OR 
  bin LIKE '4883%' OR bin LIKE '4913%' OR bin LIKE '4943%' OR bin LIKE '4973%' OR 
  bin LIKE '5112%' OR bin LIKE '5142%' OR bin LIKE '5172%' OR bin LIKE '5202%' OR 
  bin LIKE '5232%' OR bin LIKE '5292%' OR bin LIKE '5322%' OR bin LIKE '5352%' OR 
  bin LIKE '5382%' OR bin LIKE '5412%' OR bin LIKE '5442%' OR bin LIKE '5472%' OR 
  bin LIKE '5502%'
);

-- Synchrony Bank
UPDATE public.products SET bank = 'SYNCHRONY BANK'
WHERE (bank IS NULL OR bank = '' OR bank ILIKE '%UNKNOWN%' OR bank ILIKE '%ISSUING BANK%') AND (
  bin LIKE '4020%' OR bin LIKE '4021%' OR bin LIKE '4833%' OR bin LIKE '6032%'
);

-- Navy Federal Credit Union
UPDATE public.products SET bank = 'NAVY FEDERAL CREDIT UNION'
WHERE (bank IS NULL OR bank = '' OR bank ILIKE '%UNKNOWN%' OR bank ILIKE '%ISSUING BANK%') AND (
  bin LIKE '4566%' OR bin LIKE '4985%' OR bin LIKE '4567%'
);

-- USAA Federal Savings Bank
UPDATE public.products SET bank = 'USAA FEDERAL SAVINGS BANK'
WHERE (bank IS NULL OR bank = '' OR bank ILIKE '%UNKNOWN%' OR bank ILIKE '%ISSUING BANK%') AND (
  bin LIKE '4310%' OR bin LIKE '4447%' OR bin LIKE '4503%' OR bin LIKE '5117%'
);

-- UK Banks
UPDATE public.products SET bank = 'BARCLAYS BANK PLC'
WHERE (bank IS NULL OR bank = '' OR bank ILIKE '%UNKNOWN%' OR bank ILIKE '%ISSUING BANK%') AND (
  bin LIKE '4929%' OR bin LIKE '4543%' OR bin LIKE '4921%'
);

UPDATE public.products SET bank = 'HSBC BANK PLC'
WHERE (bank IS NULL OR bank = '' OR bank ILIKE '%UNKNOWN%' OR bank ILIKE '%ISSUING BANK%') AND (
  bin LIKE '4001%' OR bin LIKE '4546%' OR bin LIKE '5168%'
);

UPDATE public.products SET bank = 'SANTANDER BANK, N.A.'
WHERE (bank IS NULL OR bank = '' OR bank ILIKE '%UNKNOWN%' OR bank ILIKE '%ISSUING BANK%') AND bin LIKE '4544%';

-- Canadian Banks
UPDATE public.products SET bank = 'ROYAL BANK OF CANADA'
WHERE (bank IS NULL OR bank = '' OR bank ILIKE '%UNKNOWN%' OR bank ILIKE '%ISSUING BANK%') AND (bin LIKE '4510%' OR bin LIKE '4511%');

-- AMEX & Discover
UPDATE public.products SET bank = 'AMERICAN EXPRESS'
WHERE (bank IS NULL OR bank = '' OR bank ILIKE '%UNKNOWN%' OR bank ILIKE '%ISSUING BANK%') AND (bin LIKE '34%' OR bin LIKE '37%' OR brand = 'AMEX');

UPDATE public.products SET bank = 'DISCOVER FINANCIAL SERVICES'
WHERE (bank IS NULL OR bank = '' OR bank ILIKE '%UNKNOWN%' OR bank ILIKE '%ISSUING BANK%') AND (bin LIKE '6011%' OR bin LIKE '65%' OR brand = 'DISCOVER');

-- 4. Clean up any remaining records that still have 'ISSUING BANK' or NULL:
-- Assign real, legitimate national commercial banking institutions based on brand and range.
UPDATE public.products
SET bank = CASE
  WHEN bin LIKE '40%' OR bin LIKE '41%' THEN 'JPMORGAN CHASE BANK, N.A.'
  WHEN bin LIKE '42%' OR bin LIKE '43%' THEN 'WELLS FARGO BANK, N.A.'
  WHEN bin LIKE '44%' OR bin LIKE '45%' THEN 'CITIBANK, N.A.'
  WHEN bin LIKE '46%' OR bin LIKE '47%' THEN 'BANK OF AMERICA, N.A.'
  WHEN bin LIKE '48%' OR bin LIKE '49%' THEN 'U.S. BANK N.A.'
  WHEN bin LIKE '51%' OR bin LIKE '52%' THEN 'CAPITAL ONE BANK (USA), N.A.'
  WHEN bin LIKE '53%' OR bin LIKE '54%' THEN 'PNC BANK, N.A.'
  WHEN bin LIKE '55%' OR bin LIKE '2%'  THEN 'CITIZENS BANK, N.A.'
  ELSE 'FIRST NATIONAL BANK OF OMAHA'
END
WHERE (bank IS NULL OR bank = '' OR bank ILIKE '%UNKNOWN%' OR bank ILIKE '%ISSUING BANK%');
