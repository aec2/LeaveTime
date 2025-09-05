public class Solution
{
	public static List<List<string>> GroupAnagrams(string[] strs)
	{
		var new_arr = new string[strs.Length];
		var resultList = new List<List<string>>();
		for (int i = 0; i < strs.Length; i++)
		{
			var charArray = strs[i].ToCharArray();
			Array.Sort(charArray);
			new_arr[i] = new string (charArray);
		}

		for (int i = 0; i < new_arr.Length; i++)
		{
			if (new_arr[i] == "*")
				continue;
			var tempList = new List<string>();
			tempList.Add(strs[i]);
			for (int j = i + 1; j < new_arr.Length; j++)
			{
				if (new_arr[i] == new_arr[j] && i != j && new_arr[j] != "*")
				{
					tempList.Add(strs[j]);
					new_arr[j] = "*";
				}
			}
			resultList.Add(tempList);
		}

		return resultList;
	}
}
